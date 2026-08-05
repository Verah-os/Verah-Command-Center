import { setTimeout as delay } from "node:timers/promises";

import { appendAuditEvent } from "./audit.ts";
import { invokeCodex } from "./codex-runner.ts";
import type { DispatcherGitHubOperations } from "./dispatcher-github.ts";
import { dispatcherGitHubOperations } from "./dispatcher-github.ts";
import {
  acquireDispatcherMutex,
  freshDispatcherState,
  isDispatcherStopped,
  readDispatcherState,
  releaseDispatcherMutex,
  writeDispatcherState,
} from "./dispatcher-state.ts";
import {
  backoffUntil,
  budgetDecision,
  evaluatePullRequestGate,
  resetWindowIfExpired,
} from "./dispatcher-policy.ts";
import type {
  CodexInvocationResult,
  DispatcherConfig,
  DispatcherDecision,
  DispatcherState,
} from "./dispatcher-types.ts";
import type { GitHubOperations } from "./github.ts";
import { githubOperations } from "./github.ts";
import { dryRunCycle, heartbeatCycle } from "./orchestrator.ts";
import { isStopped, readCheckpoint } from "./state.ts";
import type { VerahOsConfig } from "./types.ts";

export type DispatcherOperations = {
  github: GitHubOperations;
  dispatcherGitHub: DispatcherGitHubOperations;
  invoke(config: DispatcherConfig, signal?: AbortSignal): Promise<CodexInvocationResult>;
};

const defaultOperations: DispatcherOperations = {
  github: githubOperations,
  dispatcherGitHub: dispatcherGitHubOperations,
  invoke: invokeCodex,
};

function publicStatus(state: DispatcherState, config: DispatcherConfig) {
  const heartbeatAgeMs = state.heartbeatAt ? Math.max(0, Date.now() - Date.parse(state.heartbeatAt)) : null;
  return {
    status: state.status,
    enabled: config.enabled,
    dryRun: config.dryRun,
    pid: state.pid,
    activeIssueNumber: state.activeIssueNumber,
    activePullRequestNumber: state.activePullRequestNumber,
    cyclesStarted: state.cyclesStarted,
    invocations: state.invocations,
    reportedTokens: state.reportedTokens,
    correctionInvocations: state.correctionInvocations,
    pauseReason: state.pauseReason,
    nextAttemptAt: state.nextAttemptAt,
    heartbeatAgeMs,
    watchdogHealthy: heartbeatAgeMs === null || heartbeatAgeMs <= config.watchdogTimeoutMs,
    lastOutcome: state.lastOutcome,
    productionMutations: [],
    remoteDatabaseMutations: [],
  };
}

async function persist(
  config: DispatcherConfig,
  state: DispatcherState,
  event: string,
  detail?: string,
) {
  const next = { ...state, updatedAt: new Date().toISOString() };
  await writeDispatcherState(config.runtimeDirectory, next);
  await appendAuditEvent(config.runtimeDirectory, {
    event,
    at: next.updatedAt,
    issueNumber: next.activeIssueNumber,
    pullRequestNumber: next.activePullRequestNumber,
    state: next.status,
    detail,
  });
  return next;
}

async function decide(
  core: VerahOsConfig,
  config: DispatcherConfig,
  state: DispatcherState,
  operations: DispatcherOperations,
  now = new Date(),
): Promise<{ decision: DispatcherDecision; state: DispatcherState }> {
  if (core.killSwitch || await isStopped(core.runtimeDirectory)) {
    return { decision: { action: "pause", reason: "kill_switch", until: null }, state };
  }
  if (await isDispatcherStopped(config.runtimeDirectory)) {
    return { decision: { action: "pause", reason: "stopped", until: null }, state };
  }
  const checkpoint = await readCheckpoint(core.runtimeDirectory);
  const pullRequests = await operations.github.listOpenPullRequests(core.repository);
  if (!checkpoint && pullRequests.length > 0) {
    const active = pullRequests.sort(
      (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    )[0];
    return {
      decision: { action: "pause", reason: "human_review", until: null },
      state: { ...state, activeIssueNumber: null, activePullRequestNumber: active.number },
    };
  }
  const matching = checkpoint?.pullRequestNumber
    ? pullRequests.find((pullRequest) => pullRequest.number === checkpoint.pullRequestNumber) ?? checkpoint.pullRequestNumber
    : checkpoint
      ? pullRequests.find((pullRequest) => pullRequest.headRefName === checkpoint.branch) ?? null
      : null;
  const withActive = {
    ...state,
    activeIssueNumber: checkpoint?.issueNumber ?? null,
    activePullRequestNumber: typeof matching === "number" ? matching : matching?.number ?? null,
  };
  if (matching) {
    const gate = await operations.dispatcherGitHub.inspectPullRequest(core.repository, matching);
    const activeIssue = checkpoint?.issueNumber
      ? (await operations.github.listOpenIssues(core.repository))
          .find((candidate) => candidate.number === checkpoint.issueNumber) ?? null
      : null;
    const activeLabels = new Set(activeIssue?.labels.map((label) => label.toLowerCase()) ?? []);
    if (
      gate.state === "OPEN" &&
      (!activeIssue || !activeLabels.has("codex:authorized") || !activeLabels.has("codex:ready") || activeLabels.has("codex:blocked"))
    ) {
      return {
        decision: { action: "pause", reason: "human_review", until: null },
        state: withActive,
      };
    }
    const budget = budgetDecision(withActive, config, false, now);
    if (budget) return { decision: budget, state: withActive };
    let decision = evaluatePullRequestGate(gate);
    if (
      decision.action === "pause" &&
      decision.reason === "human_review" &&
      checkpoint?.issueNumber
    ) {
      if (activeLabels.has("codex:auto-merge")) {
        decision = { action: "invoke", reason: "release_pr" };
      }
    }
    if (
      decision.action === "invoke" &&
      ["address_review", "correct_pr"].includes(decision.reason) &&
      withActive.correctionInvocations + (checkpoint?.correctionAttempts ?? 0) >= core.maxCorrectionAttempts
    ) {
      return {
        decision: { action: "pause", reason: "human_review", until: null },
        state: withActive,
      };
    }
    return { decision, state: withActive };
  }
  if (checkpoint) {
    if (!checkpoint.issueNumber) {
      return {
        decision: { action: "pause", reason: "human_review", until: null },
        state: withActive,
      };
    }
    const issue = (await operations.github.listOpenIssues(core.repository))
      .find((candidate) => candidate.number === checkpoint.issueNumber);
    const labels = new Set(issue?.labels.map((label) => label.toLowerCase()) ?? []);
    if (
      !issue || !labels.has("codex:authorized") || !labels.has("codex:ready") || labels.has("codex:blocked")
    ) {
      return {
        decision: { action: "pause", reason: "human_review", until: null },
        state: withActive,
      };
    }
    const budget = budgetDecision(withActive, config, false, now);
    return {
      decision: budget ?? { action: "invoke", reason: "continue_issue" },
      state: withActive,
    };
  }
  const queue = await dryRunCycle(core, operations.github);
  if (queue.status === "selected" && queue.issue) {
    const selected = { ...withActive, activeIssueNumber: queue.issue.number };
    const budget = budgetDecision(selected, config, true, now);
    return { decision: budget ?? { action: "invoke", reason: "start_issue" }, state: selected };
  }
  if (queue.status === "locked" || queue.status === "resumed") {
    return { decision: { action: "pause", reason: "human_review", until: null }, state: withActive };
  }
  return { decision: { action: "pause", reason: "no_work", until: null }, state: withActive };
}

export async function runDispatcherOnce(
  core: VerahOsConfig,
  config: DispatcherConfig,
  operations: DispatcherOperations = defaultOperations,
  now = new Date(),
  existingOwner?: string,
) {
  const owner = existingOwner ?? await acquireDispatcherMutex(config.runtimeDirectory);
  const runnerPid = existingOwner ? process.pid : null;
  try {
    let state = resetWindowIfExpired(
      (await readDispatcherState(config.runtimeDirectory)) ?? freshDispatcherState(now),
      config,
      now,
    );
    const evaluated = await decide(core, config, state, operations, now);
    state = evaluated.state;
    if (evaluated.decision.action === "pause") {
      state = await persist(config, {
        ...state,
        status: "paused",
        pid: runnerPid,
        pauseReason: evaluated.decision.reason,
        nextAttemptAt: evaluated.decision.until,
        heartbeatAt: now.toISOString(),
        lastOutcome: `paused:${evaluated.decision.reason}`,
      }, "dispatcher_paused", evaluated.decision.reason);
      return { ...publicStatus(state, config), decision: evaluated.decision, invoked: false };
    }
    const isNewIssue = evaluated.decision.reason === "start_issue";
    if (config.dryRun || !config.enabled) {
      state = await persist(config, {
        ...state,
        status: "paused",
        pid: runnerPid,
        heartbeatAt: now.toISOString(),
        pauseReason: "human_review",
        lastOutcome: `dry_run:${evaluated.decision.reason}`,
      }, "dispatcher_dry_run", evaluated.decision.reason);
      return { ...publicStatus(state, config), decision: evaluated.decision, invoked: false };
    }
    state = await persist(config, {
      ...state,
      status: "running",
      pid: process.pid,
      pauseReason: null,
      nextAttemptAt: null,
      invocations: state.invocations + 1,
      cyclesStarted: state.cyclesStarted + (isNewIssue ? 1 : 0),
      correctionInvocations: isNewIssue ? 0 : state.correctionInvocations + (
        ["address_review", "correct_pr"].includes(evaluated.decision.reason) ? 1 : 0
      ),
      activeInvocationStartedAt: now.toISOString(),
      heartbeatAt: now.toISOString(),
      lastOutcome: `invoking:${evaluated.decision.reason}`,
    }, "dispatcher_invocation_started", evaluated.decision.reason);
    const controller = new AbortController();
    let heartbeatFailure: Error | null = null;
    let heartbeatInFlight: Promise<void> | null = null;
    const heartbeat = setInterval(() => {
      if (heartbeatInFlight) return;
      heartbeatInFlight = (async () => {
        try {
          if (await isDispatcherStopped(config.runtimeDirectory)) controller.abort();
          const checkpoint = await readCheckpoint(core.runtimeDirectory);
          if (checkpoint) await heartbeatCycle(core);
          state = await persist(config, { ...state, heartbeatAt: new Date().toISOString() }, "dispatcher_heartbeat");
        } catch (error) {
          heartbeatFailure = error as Error;
          controller.abort();
        }
      })().finally(() => {
        heartbeatInFlight = null;
      });
    }, config.heartbeatIntervalMs);
    let result;
    try {
      result = await operations.invoke(config, controller.signal);
    } finally {
      clearInterval(heartbeat);
      await heartbeatInFlight;
    }
    if (heartbeatFailure) throw heartbeatFailure;
    const failed = result.status !== "success";
    const rateLimited = ["rate_limit", "quota", "authentication"].includes(result.status);
    const updated = {
      ...state,
      status: failed ? "paused" as const : "idle" as const,
      pid: runnerPid,
      activeInvocationStartedAt: null,
      reportedTokens: state.reportedTokens + result.reportedTokens,
      consecutiveFailures: failed ? state.consecutiveFailures + 1 : 0,
      pauseReason: rateLimited ? result.status as "rate_limit" | "quota" | "authentication" : failed ? "human_review" as const : null,
      nextAttemptAt: rateLimited ? backoffUntil({ ...state, consecutiveFailures: state.consecutiveFailures + 1 }, config, now) : null,
      heartbeatAt: new Date().toISOString(),
      lastOutcome: `codex:${result.status}`,
    };
    state = await persist(config, updated, "dispatcher_invocation_finished", result.status);
    return { ...publicStatus(state, config), decision: evaluated.decision, invoked: true, invocation: result };
  } finally {
    if (!existingOwner) await releaseDispatcherMutex(config.runtimeDirectory, owner);
  }
}

export async function runDispatcherLoop(
  core: VerahOsConfig,
  config: DispatcherConfig,
  operations: DispatcherOperations = defaultOperations,
) {
  if (!config.enabled) throw new Error("dispatcher_disabled");
  const owner = await acquireDispatcherMutex(config.runtimeDirectory);
  try {
    while (!await isDispatcherStopped(config.runtimeDirectory)) {
      try {
        await runDispatcherOnce(core, config, operations, new Date(), owner);
      } catch {
        const now = new Date();
        const current = resetWindowIfExpired(
          (await readDispatcherState(config.runtimeDirectory)) ?? freshDispatcherState(now),
          config,
          now,
        );
        const failed = { ...current, consecutiveFailures: current.consecutiveFailures + 1 };
        await persist(config, {
          ...failed,
          status: "paused",
          pid: process.pid,
          heartbeatAt: now.toISOString(),
          pauseReason: "human_review",
          nextAttemptAt: backoffUntil(failed, config, now),
          lastOutcome: "dispatcher:transient_error",
        }, "dispatcher_transient_error", "sanitized");
      }
      if (await isDispatcherStopped(config.runtimeDirectory)) break;
      let remaining = config.pollIntervalMs;
      while (remaining > 0 && !await isDispatcherStopped(config.runtimeDirectory)) {
        const interval = Math.min(5_000, remaining);
        await delay(interval);
        remaining -= interval;
      }
    }
  } finally {
    await releaseDispatcherMutex(config.runtimeDirectory, owner);
  }
  const state = (await readDispatcherState(config.runtimeDirectory)) ?? freshDispatcherState();
  await persist(config, { ...state, status: "idle", pid: null, lastOutcome: "clean_shutdown" }, "dispatcher_stopped");
}

export async function dispatcherStatus(config: DispatcherConfig) {
  const state = (await readDispatcherState(config.runtimeDirectory)) ?? freshDispatcherState();
  return publicStatus(state, config);
}
