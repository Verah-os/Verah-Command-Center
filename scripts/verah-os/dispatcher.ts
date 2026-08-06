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
  DispatcherPauseReason,
  DispatcherState,
  DispatcherRunStatus,
} from "./dispatcher-types.ts";
import type { GitHubOperations } from "./github.ts";
import { githubOperations } from "./github.ts";
import { completeCycle, continueCycle, dryRunCycle, heartbeatCycle } from "./orchestrator.ts";
import { isStopped, readCheckpoint, writeCheckpoint } from "./state.ts";
import type { VerahOsConfig } from "./types.ts";
import type { WorkspaceOperations } from "./workspace.ts";
import { workspaceOperations } from "./workspace.ts";

export type DispatcherOperations = {
  github: GitHubOperations;
  dispatcherGitHub: DispatcherGitHubOperations;
  workspace: WorkspaceOperations;
  invoke(config: DispatcherConfig, signal?: AbortSignal): Promise<CodexInvocationResult>;
};

const defaultOperations: DispatcherOperations = {
  github: githubOperations,
  dispatcherGitHub: dispatcherGitHubOperations,
  workspace: workspaceOperations,
  invoke: invokeCodex,
};

function publicStatus(state: DispatcherState, config: DispatcherConfig) {
  const heartbeatAgeMs = state.heartbeatAt ? Math.max(0, Date.now() - Date.parse(state.heartbeatAt)) : null;
  const windowEndsAt = new Date(Date.parse(state.windowStartedAt) + config.windowDurationMs).toISOString();
  const remainingInvocations = Math.max(0, config.maxInvocationsPerWindow - state.invocations);
  const remainingReportedTokens = Math.max(0, config.maxReportedTokensPerWindow - state.reportedTokens);
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
    featureInvocations: state.featureInvocations,
    correctionInvocations: state.correctionInvocations,
    queue: state.queue,
    budget: {
      windowStartedAt: state.windowStartedAt,
      windowEndsAt,
      invocationsUsed: state.invocations,
      invocationsRemaining: remainingInvocations,
      reportedTokensUsed: state.reportedTokens,
      reportedTokensRemaining: remainingReportedTokens,
      correctionInvocationsReserved: Math.min(config.reserveInvocations, remainingInvocations),
      correctionTokensReserved: Math.min(config.reserveReportedTokens, remainingReportedTokens),
    },
    pauseReason: state.pauseReason,
    nextAttemptAt: state.nextAttemptAt,
    heartbeatAgeMs,
    watchdogHealthy: heartbeatAgeMs === null || heartbeatAgeMs <= config.watchdogTimeoutMs,
    lastOutcome: state.lastOutcome,
    productionMutations: [],
    remoteDatabaseMutations: [],
  };
}

function waitingStatus(reason: DispatcherPauseReason | CodexInvocationResult["status"]): DispatcherRunStatus {
  if (reason === "budget") return "waiting_budget";
  if (reason === "quota") return "waiting_quota";
  if (reason === "rate_limit") return "waiting_rate_limit";
  if (reason === "authentication") return "waiting_authentication";
  if (reason === "host_lock_expired" || reason === "workspace_recovery") return "recovering";
  return "paused";
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

async function maintainQueuedLease(
  core: VerahOsConfig,
  config: DispatcherConfig,
  state: DispatcherState,
  operations: DispatcherOperations,
  now: Date,
) {
  if (!config.enabled || config.dryRun || !state.queue) return state;
  const checkpoint = await readCheckpoint(core.runtimeDirectory);
  if (!checkpoint) return state;
  const heartbeat = await heartbeatCycle(core, now, operations.workspace);
  const next = {
    ...state,
    status: heartbeat.status === "recovered" ? "recovering" as const : state.status,
    pauseReason: heartbeat.status === "recovered" ? "host_lock_expired" as const : state.pauseReason,
    lastOutcome: heartbeat.status === "recovered" ? "recovering:host_lock_expired" : state.lastOutcome,
    queue: state.queue ? {
      ...state.queue,
      checkpointRunId: heartbeat.runId,
      leaseExpiresAt: heartbeat.expiresAt,
      workingState: heartbeat.workspace,
    } : null,
  };
  return heartbeat.status === "recovered"
    ? await persist(config, next, "dispatcher_lease_recovered", "host_lock_expired")
    : next;
}

async function persistCheckpointWorkingState(
  core: VerahOsConfig,
  state: DispatcherState,
  operations: DispatcherOperations,
  pauseReason: DispatcherPauseReason | null,
  nextAttemptAt: string | null,
  now: Date,
) {
  const checkpoint = await readCheckpoint(core.runtimeDirectory);
  if (!checkpoint) return state;
  const heartbeat = await heartbeatCycle(core, now, operations.workspace);
  const current = await readCheckpoint(core.runtimeDirectory);
  if (!current) throw new Error("verah_os_checkpoint_missing");
  const updatedCheckpoint = {
    ...current,
    leaseExpiresAt: heartbeat.expiresAt,
    pauseReason,
    nextAttemptAt,
    workspace: heartbeat.workspace,
    updatedAt: now.toISOString(),
  };
  await writeCheckpoint(core.runtimeDirectory, updatedCheckpoint);
  return {
    ...state,
    status: heartbeat.status === "recovered" ? "recovering" as const : state.status,
    pauseReason: heartbeat.status === "recovered" ? "host_lock_expired" as const : state.pauseReason,
    lastOutcome: heartbeat.status === "recovered" ? "recovering:host_lock_expired" : state.lastOutcome,
    queue: state.queue ? {
      ...state.queue,
      checkpointRunId: heartbeat.runId,
      leaseExpiresAt: heartbeat.expiresAt,
      pauseReason,
      nextAttemptAt,
      workingState: heartbeat.workspace,
    } : null,
  };
}

async function completeMergedCheckpoint(
  core: VerahOsConfig,
  config: DispatcherConfig,
  state: DispatcherState,
  operations: DispatcherOperations,
) {
  const checkpoint = await readCheckpoint(core.runtimeDirectory);
  if (!checkpoint?.pullRequestNumber) return { state, completed: false };
  const gate = await operations.dispatcherGitHub.inspectPullRequest(
    core.repository,
    checkpoint.pullRequestNumber,
  );
  if (gate.state !== "MERGED") return { state, completed: false };
  await completeCycle(core);
  const completed = await persist(config, {
    ...state,
    status: "idle",
    activeIssueNumber: null,
    activePullRequestNumber: null,
    queue: null,
    pauseReason: null,
    nextAttemptAt: null,
    activeInvocationStartedAt: null,
    lastOutcome: "checkpoint_completed_after_merge",
  }, "dispatcher_checkpoint_completed_after_merge", `pr:${checkpoint.pullRequestNumber}`);
  return { state: completed, completed: true };
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
      state: { ...state, activeIssueNumber: null, activePullRequestNumber: active.number, queue: null },
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
    queue: checkpoint
      ? {
          issueNumber: checkpoint.issueNumber ?? state.queue?.issueNumber ?? null,
          pullRequestNumber: typeof matching === "number" ? matching : matching?.number ?? null,
          branch: checkpoint.branch,
          baseSha: checkpoint.baseSha,
          checkpointRunId: checkpoint.runId,
          phase: matching ? "pull_request" as const : state.queue?.phase ?? "active" as const,
          reservedAt: state.queue?.reservedAt ?? checkpoint.startedAt,
          leaseExpiresAt: checkpoint.leaseExpiresAt,
          pauseReason: checkpoint.pauseReason as DispatcherPauseReason | null,
          nextAttemptAt: checkpoint.nextAttemptAt,
          workingState: checkpoint.workspace,
        }
      : null,
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
    const reserved = withActive.queue?.phase === "reserved";
    const budget = budgetDecision(withActive, config, reserved, now, reserved);
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
    const reserved = withActive.queue?.phase === "reserved";
    const budget = budgetDecision(withActive, config, reserved, now, reserved);
    return {
      decision: budget ?? { action: "invoke", reason: "continue_issue" },
      state: withActive,
    };
  }
  const queue = await dryRunCycle(core, operations.github);
  if (queue.status === "selected" && queue.issue) {
    const selected = { ...withActive, activeIssueNumber: queue.issue.number };
    const budget = config.dryRun || !config.enabled ? budgetDecision(selected, config, true, now) : null;
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
    state = await maintainQueuedLease(core, config, state, operations, now);
    const merged = await completeMergedCheckpoint(core, config, state, operations);
    state = merged.state;
    const evaluated = await decide(core, config, state, operations, now);
    state = evaluated.state;
    if (evaluated.decision.action === "pause") {
      state = await persistCheckpointWorkingState(
        core,
        state,
        operations,
        evaluated.decision.reason,
        evaluated.decision.until,
        now,
      );
      state = await persist(config, {
        ...state,
        status: waitingStatus(evaluated.decision.reason),
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
    if (isNewIssue) {
      const reservation = await continueCycle(core, operations.github, now, operations.workspace);
      const checkpoint = await readCheckpoint(core.runtimeDirectory);
      if (!checkpoint?.issueNumber || !reservation.branch || !reservation.baseSha) {
        throw new Error("dispatcher_reservation_incomplete");
      }
      state = await persist(config, {
        ...state,
        status: "queued",
        cyclesStarted: state.cyclesStarted + 1,
        activeIssueNumber: checkpoint.issueNumber,
        activePullRequestNumber: checkpoint.pullRequestNumber,
        queue: {
          issueNumber: checkpoint.issueNumber,
          pullRequestNumber: checkpoint.pullRequestNumber,
          branch: checkpoint.branch,
          baseSha: checkpoint.baseSha,
          checkpointRunId: checkpoint.runId,
          phase: "reserved",
          reservedAt: checkpoint.startedAt,
          leaseExpiresAt: checkpoint.leaseExpiresAt,
          pauseReason: checkpoint.pauseReason as DispatcherPauseReason | null,
          nextAttemptAt: checkpoint.nextAttemptAt,
          workingState: checkpoint.workspace,
        },
        heartbeatAt: now.toISOString(),
        lastOutcome: "queued:reserved",
      }, "dispatcher_issue_queued", "reserved");
      const budget = budgetDecision(state, config, true, now, true);
      if (budget) {
        state = await persistCheckpointWorkingState(
          core,
          state,
          operations,
          budget.reason,
          budget.until,
          now,
        );
        state = await persist(config, {
          ...state,
          status: waitingStatus(budget.reason),
          pauseReason: budget.reason,
          nextAttemptAt: budget.until,
          lastOutcome: `paused:${budget.reason}`,
        }, "dispatcher_paused", budget.reason);
        return { ...publicStatus(state, config), decision: budget, invoked: false };
      }
    }
    const featureInvocation = isNewIssue || (
      evaluated.decision.reason === "continue_issue" && state.queue?.phase === "reserved"
    );
    state = await persistCheckpointWorkingState(core, state, operations, null, null, now);
    state = await persist(config, {
      ...state,
      status: isNewIssue ? "running" : "resuming",
      pid: process.pid,
      pauseReason: null,
      nextAttemptAt: null,
      invocations: state.invocations + 1,
      featureInvocations: state.featureInvocations + (featureInvocation ? 1 : 0),
      correctionInvocations: isNewIssue ? 0 : state.correctionInvocations + (
        ["address_review", "correct_pr"].includes(evaluated.decision.reason) ? 1 : 0
      ),
      queue: state.queue ? { ...state.queue, phase: "active" } : null,
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
          if (checkpoint) {
            const renewed = await heartbeatCycle(core, new Date(), operations.workspace);
            if (state.queue) {
              state = {
                ...state,
                queue: {
                  ...state.queue,
                  checkpointRunId: renewed.runId,
                  leaseExpiresAt: renewed.expiresAt,
                  workingState: renewed.workspace,
                },
              };
            }
          }
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
    if (rateLimited) {
      const until = backoffUntil(
        { ...state, consecutiveFailures: state.consecutiveFailures + 1 },
        config,
        now,
      );
      state = await persistCheckpointWorkingState(
        core,
        state,
        operations,
        result.status as "rate_limit" | "quota" | "authentication",
        until,
        new Date(),
      );
    }
    const updated = {
      ...state,
      status: rateLimited
        ? waitingStatus(result.status)
        : failed
          ? "paused" as const
          : "idle" as const,
      pid: runnerPid,
      activeInvocationStartedAt: null,
      reportedTokens: state.reportedTokens + result.reportedTokens,
      consecutiveFailures: failed ? state.consecutiveFailures + 1 : 0,
      pauseReason: rateLimited ? result.status as "rate_limit" | "quota" | "authentication" : failed ? "human_review" as const : null,
      nextAttemptAt: rateLimited ? state.queue?.nextAttemptAt ?? backoffUntil({ ...state, consecutiveFailures: state.consecutiveFailures + 1 }, config, now) : null,
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
      } catch (error) {
        const now = new Date();
        const current = resetWindowIfExpired(
          (await readDispatcherState(config.runtimeDirectory)) ?? freshDispatcherState(now),
          config,
          now,
        );
        const failed = { ...current, consecutiveFailures: current.consecutiveFailures + 1 };
        const message = error instanceof Error ? error.message : "";
        const reason: DispatcherPauseReason = message.includes("host_lock_expired")
          ? "host_lock_expired"
          : message.includes("workspace_branch") || message.includes("workspace_dirty")
            ? "workspace_recovery"
            : "human_review";
        await persist(config, {
          ...failed,
          status: waitingStatus(reason),
          pid: process.pid,
          heartbeatAt: now.toISOString(),
          pauseReason: reason,
          nextAttemptAt: backoffUntil(failed, config, now),
          lastOutcome: reason === "human_review" ? "dispatcher:transient_error" : `recovering:${reason}`,
        }, reason === "human_review" ? "dispatcher_transient_error" : "dispatcher_recoverable_error", reason);
      }
      if (await isDispatcherStopped(config.runtimeDirectory)) break;
      let remaining = config.pollIntervalMs;
      let heartbeatRemaining = config.heartbeatIntervalMs;
      while (remaining > 0 && !await isDispatcherStopped(config.runtimeDirectory)) {
        const interval = Math.min(5_000, remaining, heartbeatRemaining);
        await delay(interval);
        remaining -= interval;
        heartbeatRemaining -= interval;
        const checkpoint = heartbeatRemaining <= 0
          ? await readCheckpoint(core.runtimeDirectory)
          : null;
        if (checkpoint && !await isDispatcherStopped(config.runtimeDirectory)) {
          const heartbeat = await heartbeatCycle(core, new Date(), operations.workspace);
          const current = (await readDispatcherState(config.runtimeDirectory)) ?? freshDispatcherState();
          await persist(config, {
            ...current,
            status: heartbeat.status === "recovered" ? "recovering" : current.status,
            pauseReason: heartbeat.status === "recovered" ? "host_lock_expired" : current.pauseReason,
            heartbeatAt: new Date().toISOString(),
            lastOutcome: heartbeat.status === "recovered"
              ? "recovering:host_lock_expired"
              : current.lastOutcome,
            queue: current.queue ? {
              ...current.queue,
              checkpointRunId: heartbeat.runId,
              leaseExpiresAt: heartbeat.expiresAt,
              workingState: heartbeat.workspace,
            } : null,
          }, heartbeat.status === "recovered" ? "dispatcher_lease_recovered" : "dispatcher_wait_heartbeat");
        }
        if (heartbeatRemaining <= 0) heartbeatRemaining = config.heartbeatIntervalMs;
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
