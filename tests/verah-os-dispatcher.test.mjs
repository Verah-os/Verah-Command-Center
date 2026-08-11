import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { readDispatcherConfig } from "../scripts/verah-os/dispatcher-config.ts";
import { checkContext } from "../scripts/verah-os/dispatcher-github.ts";
import {
  backoffUntil,
  budgetDecision,
  classifyCodexFailure,
  evaluatePullRequestGate,
} from "../scripts/verah-os/dispatcher-policy.ts";
import {
  acquireDispatcherMutex,
  dispatcherDirectory,
  freshDispatcherState,
  readDispatcherState,
  releaseDispatcherMutex,
  requestDispatcherStop,
  writeDispatcherState,
} from "../scripts/verah-os/dispatcher-state.ts";
import { dispatcherStatus, runDispatcherLoop, runDispatcherOnce } from "../scripts/verah-os/dispatcher.ts";
import {
  DISPATCHER_RESUME_PROMPT,
  buildCodexArguments,
  invokeCodex,
  reportedTokens,
  threadIdFromEvent,
} from "../scripts/verah-os/codex-runner.ts";
import { heartbeatCycle } from "../scripts/verah-os/orchestrator.ts";
import {
  acquireHostLock,
  clearRunState,
  readCheckpoint,
  readHostLock,
  writeCheckpoint,
} from "../scripts/verah-os/state.ts";
import { workspaceOperations } from "../scripts/verah-os/workspace.ts";

const sha = "a".repeat(40);

test("GitHub workflow jobs use the stable required-check context", () => {
  assert.equal(checkContext({ workflowName: "CI", name: "Application" }), "CI / Application");
  assert.equal(checkContext({ context: "Vercel" }), "Vercel");
});

function issue(number, overrides = {}) {
  return {
    number,
    title: `Issue ${number}`,
    body: "## Objetivo\nEntregar.\n## Escopo\nLocal.\n## Criterios de aceite\nTestado.",
    url: `https://github.test/issues/${number}`,
    state: "OPEN",
    createdAt: `2026-08-0${Math.min(number, 9)}T10:00:00.000Z`,
    updatedAt: "2026-08-04T10:00:00.000Z",
    labels: ["codex:authorized", "codex:ready"],
    ...overrides,
  };
}

function core(runtimeDirectory, overrides = {}) {
  return {
    enabled: true,
    killSwitch: false,
    repository: "Verah-os/Verah-Command-Center",
    maintainers: new Set(["maintainer"]),
    maxDurationMs: 60_000,
    leaseDurationMs: 60_000,
    maxCorrectionAttempts: 2,
    runtimeDirectory,
    workspaceDirectory: process.cwd(),
    ...overrides,
  };
}

function dispatcher(runtimeDirectory, overrides = {}) {
  return {
    enabled: true,
    dryRun: false,
    runtimeDirectory,
    workspaceDirectory: process.cwd(),
    pollIntervalMs: 10,
    heartbeatIntervalMs: 10_000,
    watchdogTimeoutMs: 60_000,
    windowDurationMs: 300_000,
    maxCyclesPerWindow: 2,
    maxInvocationsPerWindow: 4,
    maxInvocationDurationMs: 60_000,
    reserveInvocations: 1,
    maxReportedTokensPerWindow: 100_000,
    reserveReportedTokens: 25_000,
    baseBackoffMs: 1_000,
    maxBackoffMs: 8_000,
    codexCommand: "codex",
    codexArguments: ["--ask-for-approval", "never", "exec", "--sandbox", "workspace-write", "--json"],
    ...overrides,
  };
}

class FakeGitHub {
  constructor(issues = [], pullRequests = []) {
    this.issues = issues;
    this.pullRequests = pullRequests;
  }
  async listOpenIssues() { return structuredClone(this.issues); }
  async listOpenPullRequests() { return structuredClone(this.pullRequests); }
  async mainSha() { return sha; }
  async currentLogin() { return "maintainer"; }
  async markInProgress(_repository, issueNumber) {
    const selected = this.issues.find((candidate) => candidate.number === issueNumber);
    if (selected && !selected.labels.includes("codex:in-progress")) {
      selected.labels.push("codex:in-progress");
    }
  }
  async latestReservation() { return null; }
  async remoteBranchSha() { return null; }
}

function gate(overrides = {}) {
  return {
    number: 100,
    state: "OPEN",
    isDraft: true,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: null,
    behindBy: 0,
    unresolvedThreads: 0,
    checks: {
      "CI / Application": "success",
      "CI / Database authorization": "success",
      "CI / Required": "success",
      Vercel: "success",
    },
    ...overrides,
  };
}

function operations(github, overrides = {}) {
  return {
    github,
    dispatcherGitHub: { async inspectPullRequest() { return gate(); } },
    workspace: {
      async inspect(_directory, selectedBranch) {
        return { currentBranch: selectedBranch, headSha: sha, selectedBranchSha: sha, clean: true };
      },
      async ensureIssueBranch(_directory, selectedBranch) {
        return {
          currentBranch: selectedBranch,
          headSha: sha,
          selectedBranchSha: sha,
          clean: true,
          recovered: false,
          backupRef: null,
        };
      },
    },
    async invoke() { return { status: "success", exitCode: 0, reportedTokens: 100 }; },
    ...overrides,
  };
}

function runGit(directory, arguments_) {
  const result = spawnSync("git", arguments_, { cwd: directory, encoding: "utf8", shell: false });
  if (result.status !== 0) throw new Error(result.stderr || `git ${arguments_[0]} failed`);
  return result.stdout.trim();
}

async function createCheckpoint(directory, now, overrides = {}) {
  const lock = await acquireHostLock(directory, 60_000, now);
  const checkpoint = {
    version: 4,
    runId: lock.runId,
    repository: "Verah-os/Verah-Command-Center",
    workType: "issue",
    issueNumber: 1,
    pullRequestNumber: null,
    workTitle: "Issue 1",
    workUrl: "https://github.test/issues/1",
    baseSha: sha,
    branch: "feat/1",
    state: "testing",
    correctionAttempts: 0,
    recoveryAttempts: 0,
    lastKnownHeadSha: sha,
    lastKnownRemoteHeadSha: null,
    lastKnownPullRequestNumber: null,
    leaseExpiresAt: lock.expiresAt,
    pauseReason: null,
    nextAttemptAt: null,
    workspace: null,
    startedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  };
  await writeCheckpoint(directory, checkpoint);
  return checkpoint;
}

test("dispatcher defaults are disabled, dry-run and reject unsafe Codex flags", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-dispatcher-config-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const value = await readDispatcherConfig(core(directory), {});
  assert.equal(value.enabled, false);
  assert.equal(value.dryRun, true);
  assert.deepEqual(value.codexArguments, [
    "--ask-for-approval",
    "never",
    "-c",
    "sandbox_workspace_write.network_access=true",
    "exec",
    "--sandbox",
    "workspace-write",
    "--json",
  ]);
  await assert.rejects(
    readDispatcherConfig(core(directory), { VERAH_OS_CODEX_ARGUMENTS_JSON: '["exec","--yolo"]' }),
    /arguments_unsafe/,
  );
  await assert.rejects(
    readDispatcherConfig(core(directory), { VERAH_OS_CODEX_ARGUMENTS_JSON: '["exec","--json"]' }),
    /arguments_incomplete/,
  );
  await assert.rejects(
    readDispatcherConfig(core(directory), {
      VERAH_OS_CODEX_ARGUMENTS_JSON: '["--ask-for-approval","never","-c","sandbox_workspace_write.network_access=true","exec","--sandbox","workspace-write","--json","--ask-for-approval","on-request"]',
    }),
    /arguments_incomplete/,
  );
  await assert.rejects(
    readDispatcherConfig(core(directory), { VERAH_OS_CODEX_COMMAND: "powershell.exe" }),
    /command_not_allowed/,
  );
});

test("PR gates fail closed for conflicts, CI, review and release readiness", () => {
  assert.deepEqual(evaluatePullRequestGate(gate({ mergeable: "CONFLICTING" })), {
    action: "pause", reason: "conflict", until: null,
  });
  assert.deepEqual(evaluatePullRequestGate(gate({ checks: { ...gate().checks, Vercel: "pending" } })), {
    action: "pause", reason: "ci_pending", until: null,
  });
  assert.deepEqual(evaluatePullRequestGate(gate({ checks: { ...gate().checks, "CI / Required": "failure" } })), {
    action: "invoke", reason: "correct_pr",
  });
  assert.deepEqual(evaluatePullRequestGate(gate({ reviewDecision: "CHANGES_REQUESTED" })), {
    action: "invoke", reason: "address_review",
  });
  assert.deepEqual(evaluatePullRequestGate(gate()), { action: "invoke", reason: "release_pr" });
  assert.deepEqual(evaluatePullRequestGate(gate({ isDraft: false })), {
    action: "pause", reason: "human_review", until: null,
  });
});

test("quota, authentication and rate limits are classified without retaining output", () => {
  assert.equal(classifyCodexFailure("HTTP 429 rate limit"), "rate_limit");
  assert.equal(classifyCodexFailure("insufficient credits quota"), "quota");
  assert.equal(classifyCodexFailure("401 authentication required"), "authentication");
  assert.equal(classifyCodexFailure("ordinary failure"), "failure");
  const until = backoffUntil(
    { ...freshDispatcherState(new Date("2026-08-04T10:00:00Z")), consecutiveFailures: 2 },
    dispatcher("unused"),
    new Date("2026-08-04T10:00:00Z"),
  );
  assert.equal(until, "2026-08-04T10:00:04.000Z");
});

test("Codex adapter uses a direct child process and consumes only structured usage", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-dispatcher-runner-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = join(directory, "fake-codex.mjs");
  await writeFile(fixture, 'console.log(JSON.stringify({usage:{input_tokens:40,output_tokens:2,cached_input_tokens:8}}));\n');
  const result = await invokeCodex(dispatcher(directory, {
    codexCommand: process.execPath,
    codexArguments: [fixture],
  }));
  assert.deepEqual(result, { status: "success", exitCode: 0, reportedTokens: 34 });
  assert.equal(reportedTokens(JSON.stringify({
    usage: {
      input_tokens: 80,
      output_tokens: 5,
      input_tokens_details: { cached_tokens: 60 },
    },
  })), 25);
});

test("Codex adapter persists and resumes the session only for the same checkpoint", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-dispatcher-session-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = join(directory, "fake-codex-session.mjs");
  const argumentsFile = join(directory, "arguments.jsonl");
  const threadId = "11111111-1111-4111-8111-111111111111";
  await writeFile(fixture, [
    'import { appendFileSync } from "node:fs";',
    'appendFileSync(process.argv[2], `${JSON.stringify(process.argv.slice(3))}\\n`);',
    `console.log(JSON.stringify({type:"thread.started",thread_id:"${threadId}"}));`,
    'console.log(JSON.stringify({type:"turn.completed",usage:{input_tokens:20,output_tokens:2,cached_input_tokens:10}}));',
  ].join("\n"));
  const checkpoint = await createCheckpoint(directory, new Date("2026-08-11T12:00:00.000Z"));
  const config = dispatcher(directory, {
    codexCommand: process.execPath,
    codexArguments: [fixture, argumentsFile],
  });

  await invokeCodex(config);
  await invokeCodex(config);
  await writeCheckpoint(directory, { ...checkpoint, runId: "different-checkpoint" });
  await invokeCodex(config);

  const invocations = (await readFile(argumentsFile, "utf8"))
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  assert.equal(invocations[0].includes("resume"), false);
  assert.deepEqual(invocations[1].slice(-3), ["resume", threadId, DISPATCHER_RESUME_PROMPT]);
  assert.equal(invocations[2].includes("resume"), false);
  const session = JSON.parse(
    await readFile(join(directory, "dispatcher", "codex-session.json"), "utf8"),
  );
  assert.equal(session.checkpointRunId, "different-checkpoint");
  assert.equal(session.threadId, threadId);
});

test("Codex resume arguments stay scoped to the existing session", () => {
  const config = dispatcher("runtime", { workspaceDirectory: "workspace" });
  const threadId = "11111111-1111-4111-8111-111111111111";
  assert.equal(buildCodexArguments(config, null).includes("--cd"), true);
  assert.deepEqual(
    buildCodexArguments(config, threadId).slice(-3),
    ["resume", threadId, DISPATCHER_RESUME_PROMPT],
  );
  assert.equal(threadIdFromEvent(JSON.stringify({ type: "thread.started", thread_id: threadId })), threadId);
  assert.equal(threadIdFromEvent(JSON.stringify({ type: "thread.started", thread_id: "--last" })), null);
  assert.equal(threadIdFromEvent("not-json"), null);
});

test("Windows Codex adapter resolves the npm cmd shim without enabling a shell", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-dispatcher-windows-runner-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const entrypointDirectory = join(directory, "node_modules", "@openai", "codex", "bin");
  await mkdir(entrypointDirectory, { recursive: true });
  const command = join(directory, "codex.cmd");
  await writeFile(command, "@echo off\n");
  await writeFile(
    join(entrypointDirectory, "codex.js"),
    'console.log(JSON.stringify({usage:{input_tokens:5,output_tokens:3,cached_input_tokens:2}}));\n',
  );
  const result = await invokeCodex(dispatcher(directory, {
    codexCommand: command,
    codexArguments: [],
  }), undefined, "win32");
  assert.deepEqual(result, { status: "success", exitCode: 0, reportedTokens: 6 });
});

test("a thrown invocation always clears the dispatcher heartbeat", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-dispatcher-heartbeat-cleanup-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await assert.rejects(
    runDispatcherOnce(
      core(directory),
      dispatcher(directory, { heartbeatIntervalMs: 5 }),
      operations(new FakeGitHub([issue(1)]), {
        async invoke() { throw new Error("synthetic_spawn_failure"); },
      }),
    ),
    /synthetic_spawn_failure/,
  );
  const settled = await readDispatcherState(directory);
  await delay(30);
  assert.equal((await readDispatcherState(directory)).updatedAt, settled.updatedAt);
});

test("reserved invocation capacity prevents a new cycle but remains available to a PR", () => {
  const state = { ...freshDispatcherState(), invocations: 3 };
  assert.equal(budgetDecision(state, dispatcher("unused"), true)?.action, "pause");
  assert.equal(budgetDecision(state, dispatcher("unused"), false), null);
});

test("token capacity reserved for the current PR blocks only a new feature", () => {
  const state = { ...freshDispatcherState(), reportedTokens: 80_000 };
  assert.equal(budgetDecision(state, dispatcher("unused"), true)?.reason, "budget");
  assert.equal(budgetDecision(state, dispatcher("unused"), false), null);
});

test("a new issue is queued atomically before a budget pause and resumes after renewal", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-dispatcher-queued-budget-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const now = new Date("2026-08-04T10:00:00.000Z");
  await writeDispatcherState(directory, {
    ...freshDispatcherState(now),
    invocations: 3,
  });
  const github = new FakeGitHub([issue(1)]);
  let invocations = 0;
  const fake = operations(github, {
    async invoke() {
      invocations += 1;
      return { status: "success", exitCode: 0, reportedTokens: 25 };
    },
  });
  const resumableCore = core(directory, { maxDurationMs: 600_000 });
  const paused = await runDispatcherOnce(resumableCore, dispatcher(directory), fake, now);
  const queued = await readDispatcherState(directory);
  const checkpoint = await readCheckpoint(directory);
  assert.equal(paused.status, "waiting_budget");
  assert.equal(paused.invoked, false);
  assert.equal(invocations, 0);
  assert.equal(checkpoint.issueNumber, 1);
  assert.equal(queued.queue.issueNumber, 1);
  assert.equal(queued.queue.phase, "reserved");
  assert.equal(queued.cyclesStarted, 1);
  assert.equal(github.issues[0].labels.includes("codex:in-progress"), true);

  const resumed = await runDispatcherOnce(
    resumableCore,
    dispatcher(directory),
    fake,
    new Date("2026-08-04T10:05:00.001Z"),
  );
  assert.equal(resumed.decision.reason, "continue_issue");
  assert.equal(resumed.invoked, true);
  assert.equal(invocations, 1);
  assert.equal(resumed.queue.issueNumber, 1);
  assert.equal(resumed.queue.phase, "active");
  assert.equal(resumed.budget.correctionInvocationsReserved, 1);
});

test("dispatcher parent reserves each synthetic issue before invoking Codex", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-dispatcher-chain-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const github = new FakeGitHub([issue(1)]);
  const invoked = [];
  const fake = operations(github, {
    async invoke() {
      const checkpoint = await readCheckpoint(directory);
      invoked.push(checkpoint.issueNumber);
      await clearRunState(directory, checkpoint.runId);
      github.issues = invoked.length === 1 ? [issue(2)] : [];
      return { status: "success", exitCode: 0, reportedTokens: 500 };
    },
  });
  const first = await runDispatcherOnce(core(directory), dispatcher(directory), fake);
  const second = await runDispatcherOnce(core(directory), dispatcher(directory), fake);
  assert.deepEqual(invoked, [1, 2]);
  assert.equal(first.decision.reason, "start_issue");
  assert.equal(second.decision.reason, "start_issue");
  const state = await readDispatcherState(directory);
  assert.equal(state.cyclesStarted, 2);
  assert.equal(state.invocations, 2);
  assert.equal(state.reportedTokens, 1_000);
});

test("dry-run describes the next invocation without invoking or consuming budget", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-dispatcher-dry-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  let invocations = 0;
  const result = await runDispatcherOnce(
    core(directory),
    dispatcher(directory, { enabled: false, dryRun: true }),
    operations(new FakeGitHub([issue(1)]), { async invoke() { invocations += 1; throw new Error("unexpected"); } }),
  );
  assert.equal(result.invoked, false);
  assert.equal(invocations, 0);
  assert.equal((await readDispatcherState(directory)).invocations, 0);
});

test("an open failing PR consumes correction reserve and blocks new issue selection", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-dispatcher-ci-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const pr = {
    number: 100, title: "PR", url: "https://github.test/pull/100", state: "OPEN",
    isDraft: true, headRefName: "feat/current", headRefOid: sha,
    updatedAt: "2026-08-04T10:00:00.000Z", labels: [],
  };
  const github = new FakeGitHub([issue(2)], [pr]);
  await writeFile(join(directory, "checkpoint.json"), JSON.stringify({
    version: 3, runId: "run", repository: "Verah-os/Verah-Command-Center",
    workType: "issue", issueNumber: 2, pullRequestNumber: 100, workTitle: "Issue 2",
    workUrl: "https://github.test/issues/2", baseSha: sha, branch: "feat/current",
    state: "pr_open", correctionAttempts: 0, recoveryAttempts: 0,
    lastKnownHeadSha: sha, lastKnownRemoteHeadSha: sha, lastKnownPullRequestNumber: 100,
    startedAt: "2026-08-04T10:00:00.000Z", updatedAt: "2026-08-04T10:00:00.000Z",
  }));
  let invoked = 0;
  const result = await runDispatcherOnce(core(directory), dispatcher(directory), operations(github, {
    dispatcherGitHub: {
      async inspectPullRequest() {
        return gate({ checks: { ...gate().checks, "CI / Required": "failure" } });
      },
    },
    async invoke() { invoked += 1; return { status: "success", exitCode: 0, reportedTokens: 0 }; },
  }));
  assert.equal(result.decision.reason, "correct_pr");
  assert.equal(result.activeIssueNumber, 2);
  assert.equal(result.activePullRequestNumber, 100);
  assert.equal(invoked, 1);
});

test("pending review and CI do not invoke Codex or select another issue", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-dispatcher-review-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const pr = {
    number: 100, title: "PR", url: "https://github.test/pull/100", state: "OPEN",
    isDraft: true, headRefName: "feat/current", headRefOid: sha,
    updatedAt: "2026-08-04T10:00:00.000Z", labels: [],
  };
  let invoked = 0;
  await writeFile(join(directory, "checkpoint.json"), JSON.stringify({
    version: 3, runId: "run", repository: "Verah-os/Verah-Command-Center",
    workType: "issue", issueNumber: 2, pullRequestNumber: 100, workTitle: "Issue 2",
    workUrl: "https://github.test/issues/2", baseSha: sha, branch: "feat/current",
    state: "pr_open", correctionAttempts: 0, recoveryAttempts: 0,
    lastKnownHeadSha: sha, lastKnownRemoteHeadSha: sha, lastKnownPullRequestNumber: 100,
    startedAt: "2026-08-04T10:00:00.000Z", updatedAt: "2026-08-04T10:00:00.000Z",
  }));
  const result = await runDispatcherOnce(core(directory), dispatcher(directory), operations(
    new FakeGitHub([issue(2)], [pr]),
    {
      dispatcherGitHub: { async inspectPullRequest() { return gate({ reviewDecision: "REVIEW_REQUIRED" }); } },
      async invoke() { invoked += 1; throw new Error("unexpected"); },
    },
  ));
  assert.equal(result.pauseReason, "review_pending");
  assert.equal(invoked, 0);
});

test("an unrelated open PR blocks dispatch and cannot be adopted without a checkpoint", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-dispatcher-unowned-pr-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const pr = {
    number: 101, title: "Unowned PR", url: "https://github.test/pull/101", state: "OPEN",
    isDraft: true, headRefName: "feat/unowned", headRefOid: sha,
    updatedAt: "2026-08-04T10:00:00.000Z", labels: [],
  };
  let inspected = 0;
  let invoked = 0;
  const result = await runDispatcherOnce(core(directory), dispatcher(directory), operations(
    new FakeGitHub([issue(3)], [pr]),
    {
      dispatcherGitHub: { async inspectPullRequest() { inspected += 1; return gate(); } },
      async invoke() { invoked += 1; throw new Error("unexpected"); },
    },
  ));
  assert.equal(result.pauseReason, "human_review");
  assert.equal(result.activePullRequestNumber, 101);
  assert.equal(inspected, 0);
  assert.equal(invoked, 0);
});

test("revoked issue authorization stops an existing checkpoint before invocation", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-dispatcher-revoked-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "checkpoint.json"), JSON.stringify({
    version: 3, runId: "run", repository: "Verah-os/Verah-Command-Center",
    workType: "issue", issueNumber: 2, pullRequestNumber: null, workTitle: "Issue 2",
    workUrl: "https://github.test/issues/2", baseSha: sha, branch: "feat/current",
    state: "implementing", correctionAttempts: 0, recoveryAttempts: 0,
    lastKnownHeadSha: sha, lastKnownRemoteHeadSha: null, lastKnownPullRequestNumber: null,
    startedAt: "2026-08-04T10:00:00.000Z", updatedAt: "2026-08-04T10:00:00.000Z",
  }));
  let invoked = 0;
  const result = await runDispatcherOnce(core(directory), dispatcher(directory), operations(
    new FakeGitHub([issue(2, { labels: ["codex:ready"] })]),
    { async invoke() { invoked += 1; throw new Error("unexpected"); } },
  ));
  assert.equal(result.pauseReason, "human_review");
  assert.equal(invoked, 0);
});

test("two completed correction invocations force a human gate", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-dispatcher-corrections-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const pr = {
    number: 100, title: "PR", url: "https://github.test/pull/100", state: "OPEN",
    isDraft: true, headRefName: "feat/current", headRefOid: sha,
    updatedAt: "2026-08-04T10:00:00.000Z", labels: [],
  };
  await writeDispatcherState(directory, { ...freshDispatcherState(), correctionInvocations: 2 });
  await writeFile(join(directory, "checkpoint.json"), JSON.stringify({
    version: 3, runId: "run", repository: "Verah-os/Verah-Command-Center",
    workType: "issue", issueNumber: 2, pullRequestNumber: 100, workTitle: "Issue 2",
    workUrl: "https://github.test/issues/2", baseSha: sha, branch: "feat/current",
    state: "pr_open", correctionAttempts: 0, recoveryAttempts: 0,
    lastKnownHeadSha: sha, lastKnownRemoteHeadSha: sha, lastKnownPullRequestNumber: 100,
    startedAt: "2026-08-04T10:00:00.000Z", updatedAt: "2026-08-04T10:00:00.000Z",
  }));
  let invoked = 0;
  const result = await runDispatcherOnce(core(directory), dispatcher(directory), operations(
    new FakeGitHub([issue(2)], [pr]),
    {
      dispatcherGitHub: {
        async inspectPullRequest() {
          return gate({ checks: { ...gate().checks, "CI / Required": "failure" } });
        },
      },
      async invoke() { invoked += 1; throw new Error("unexpected"); },
    },
  ));
  assert.equal(result.pauseReason, "human_review");
  assert.equal(invoked, 0);
});

test("rate limit pauses with progressive backoff and no consumption loop", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-dispatcher-rate-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const now = new Date("2026-08-04T10:00:00.000Z");
  let attempts = 0;
  const fake = operations(new FakeGitHub([issue(1)]), {
    async invoke() {
      attempts += 1;
      return attempts === 1
        ? { status: "rate_limit", exitCode: 1, reportedTokens: 0 }
        : { status: "success", exitCode: 0, reportedTokens: 10 };
    },
  });
  const first = await runDispatcherOnce(core(directory), dispatcher(directory), fake, now);
  const second = await runDispatcherOnce(
    core(directory), dispatcher(directory), fake, new Date("2026-08-04T10:00:00.500Z"),
  );
  assert.equal(first.pauseReason, "rate_limit");
  assert.equal(first.status, "waiting_rate_limit");
  assert.equal(first.nextAttemptAt, "2026-08-04T10:00:02.000Z");
  assert.equal(second.invoked, false);
  assert.equal(second.invocations, 1);
  const resumed = await runDispatcherOnce(
    core(directory), dispatcher(directory), fake, new Date("2026-08-04T10:00:02.001Z"),
  );
  assert.equal(resumed.invoked, true);
  assert.equal(attempts, 2);
});

test("quota pauses preserve the queued checkpoint until the retry window", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-dispatcher-quota-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const now = new Date("2026-08-04T10:00:00.000Z");
  let attempts = 0;
  const github = new FakeGitHub([issue(1)]);
  const fake = operations(github, {
    async invoke() {
      attempts += 1;
      return { status: "quota", exitCode: 1, reportedTokens: 12 };
    },
  });
  const first = await runDispatcherOnce(core(directory), dispatcher(directory), fake, now);
  const second = await runDispatcherOnce(
    core(directory), dispatcher(directory), fake, new Date("2026-08-04T10:00:00.500Z"),
  );
  assert.equal(first.status, "waiting_quota");
  assert.equal(first.queue.issueNumber, 1);
  assert.equal(first.reportedTokens, 12);
  assert.equal(second.invoked, false);
  assert.equal(attempts, 1);
  assert.equal((await readCheckpoint(directory)).issueNumber, 1);
});

test("budget pause during testing atomically records lease, branch and working state", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-dispatcher-testing-budget-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const now = new Date("2026-08-04T10:00:00.000Z");
  await createCheckpoint(directory, now);
  await writeDispatcherState(directory, {
    ...freshDispatcherState(now),
    invocations: 4,
  });
  const result = await runDispatcherOnce(
    core(directory, { maxDurationMs: 600_000 }),
    dispatcher(directory),
    operations(new FakeGitHub([issue(1)])),
    now,
  );
  const checkpoint = await readCheckpoint(directory);
  const state = await readDispatcherState(directory);
  assert.equal(result.status, "waiting_budget");
  assert.equal(checkpoint.state, "testing");
  assert.equal(checkpoint.pauseReason, "budget");
  assert.equal(checkpoint.nextAttemptAt, "2026-08-04T10:05:00.000Z");
  assert.equal(checkpoint.workspace.currentBranch, "feat/1");
  assert.equal(checkpoint.leaseExpiresAt, (await readHostLock(directory)).expiresAt);
  assert.equal(state.queue.pauseReason, "budget");
  assert.equal(state.queue.workingState.currentBranch, "feat/1");
});

test("lease expiry during heartbeat is recovered explicitly without human_review", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-dispatcher-expired-heartbeat-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const started = new Date("2026-08-04T10:00:00.000Z");
  const checkpoint = await createCheckpoint(directory, started);
  const recovered = await heartbeatCycle(
    core(directory),
    new Date("2026-08-04T10:01:00.001Z"),
    operations(new FakeGitHub()).workspace,
  );
  const updated = await readCheckpoint(directory);
  assert.equal(recovered.status, "recovered");
  assert.equal(recovered.reason, "host_lock_expired");
  assert.notEqual(recovered.runId, checkpoint.runId);
  assert.equal(updated.runId, recovered.runId);
  assert.equal(updated.pauseReason, "host_lock_expired");
  assert.equal(updated.recoveryAttempts, 1);
});

test("dirty work on a previous issue branch is backed up and moved to the checkpoint branch", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-dispatcher-dirty-branch-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  runGit(directory, ["init", "-b", "main"]);
  runGit(directory, ["config", "user.email", "verah@example.test"]);
  runGit(directory, ["config", "user.name", "VERAH Test"]);
  await writeFile(join(directory, "base.txt"), "base\n");
  runGit(directory, ["add", "base.txt"]);
  runGit(directory, ["commit", "-m", "base"]);
  const baseSha = runGit(directory, ["rev-parse", "HEAD"]);
  runGit(directory, ["switch", "-c", "feat/74-previous"]);
  await writeFile(join(directory, "issue-95.txt"), "preserve me\n");

  const recovered = await workspaceOperations.ensureIssueBranch(
    directory,
    "feat/95-current",
    baseSha,
  );
  assert.equal(recovered.currentBranch, "feat/95-current");
  assert.equal(recovered.recovered, true);
  assert.match(recovered.backupRef, /^[a-f0-9]{40}$/);
  assert.match(await readFile(join(directory, "issue-95.txt"), "utf8"), /^preserve me\r?\n$/);
  assert.match(runGit(directory, ["stash", "list", "-n", "1"]), /VERAH OS automatic recovery/);
});

test("resume switches a clean checkout to the checkpoint branch before continuing", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-dispatcher-clean-branch-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  runGit(directory, ["init", "-b", "main"]);
  runGit(directory, ["config", "user.email", "verah@example.test"]);
  runGit(directory, ["config", "user.name", "VERAH Test"]);
  await writeFile(join(directory, "base.txt"), "base\n");
  runGit(directory, ["add", "base.txt"]);
  runGit(directory, ["commit", "-m", "base"]);
  const baseSha = runGit(directory, ["rev-parse", "HEAD"]);
  runGit(directory, ["switch", "-c", "feat/74-previous"]);
  const recovered = await workspaceOperations.ensureIssueBranch(
    directory,
    "feat/95-current",
    baseSha,
  );
  assert.equal(recovered.currentBranch, "feat/95-current");
  assert.equal(recovered.clean, true);
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.backupRef, null);
});

test("a merged PR completes its checkpoint and releases the next issue in the same cycle", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-dispatcher-merged-release-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const now = new Date("2026-08-04T10:00:00.000Z");
  await createCheckpoint(directory, now, {
    workType: "pull_request",
    pullRequestNumber: 100,
    state: "pr_open",
    lastKnownPullRequestNumber: 100,
  });
  await writeDispatcherState(directory, {
    ...freshDispatcherState(now),
    activeIssueNumber: 1,
    activePullRequestNumber: 100,
  });
  const invoked = [];
  const github = new FakeGitHub([issue(2)]);
  const result = await runDispatcherOnce(
    core(directory, { maxDurationMs: 600_000 }),
    dispatcher(directory),
    operations(github, {
      dispatcherGitHub: {
        async inspectPullRequest() { return gate({ number: 100, state: "MERGED", isDraft: false }); },
      },
      async invoke() {
        const checkpoint = await readCheckpoint(directory);
        invoked.push(checkpoint.issueNumber);
        await clearRunState(directory, checkpoint.runId);
        return { status: "success", exitCode: 0, reportedTokens: 0 };
      },
    }),
    now,
  );
  assert.equal(result.decision.reason, "start_issue");
  assert.deepEqual(invoked, [2]);
  assert.equal(github.issues[0].labels.includes("codex:in-progress"), true);
  assert.equal((await readCheckpoint(directory)), null);
});

test("kill switch and dispatcher STOP fail closed", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-dispatcher-stop-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const killed = await runDispatcherOnce(
    core(directory, { killSwitch: true }), dispatcher(directory), operations(new FakeGitHub([issue(1)])),
  );
  assert.equal(killed.pauseReason, "kill_switch");
  await requestDispatcherStop(directory);
  const stopped = await runDispatcherOnce(
    core(directory), dispatcher(directory), operations(new FakeGitHub([issue(1)])),
  );
  assert.equal(stopped.pauseReason, "stopped");
});

test("a dead dispatcher mutex is recovered and concurrent ownership is rejected", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-dispatcher-mutex-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(dispatcherDirectory(directory), { recursive: true });
  await writeFile(join(dispatcherDirectory(directory), "mutex.lock"), JSON.stringify({ owner: "dead", pid: 2_147_483_647 }));
  const owner = await acquireDispatcherMutex(directory);
  await assert.rejects(acquireDispatcherMutex(directory), /already_running/);
  await releaseDispatcherMutex(directory, owner);
});

test("clean shutdown preserves state and reports a healthy local-only status", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-dispatcher-shutdown-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await requestDispatcherStop(directory);
  await runDispatcherLoop(core(directory), dispatcher(directory), operations(new FakeGitHub()));
  const state = await readDispatcherState(directory);
  const status = await dispatcherStatus(dispatcher(directory));
  assert.equal(state.status, "idle");
  assert.equal(state.lastOutcome, "clean_shutdown");
  assert.deepEqual(status.productionMutations, []);
  assert.deepEqual(status.remoteDatabaseMutations, []);
});

test("dispatcher sources never contain remote database commands or unsafe sandbox bypass", async () => {
  const { readFile } = await import("node:fs/promises");
  const files = [
    "../scripts/verah-os/codex-runner.ts",
    "../scripts/verah-os/dispatcher.ts",
    "../scripts/verah-os/dispatcher-cli.ts",
    "../scripts/verah-os/windows-dispatcher.ps1",
  ];
  for (const file of files) {
    const content = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(content, /spawn(?:Sync)?\([^)]*supabase/i);
    assert.doesNotMatch(content, /danger-full-access/i);
    assert.doesNotMatch(content, /--yolo/i);
    assert.doesNotMatch(content, /shell:\s*true/i);
  }
});
