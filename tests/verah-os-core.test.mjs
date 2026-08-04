import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readVerahOsConfig } from "../scripts/verah-os/config.ts";
import { appendAuditEvent } from "../scripts/verah-os/audit.ts";
import { continueCycle, dryRunCycle, healthCycle, statusCycle } from "../scripts/verah-os/orchestrator.ts";
import {
  branchName,
  evaluateReleaseGates,
  isExecutableIssue,
  selectNextIssue,
} from "../scripts/verah-os/policy.ts";
import {
  acquireHostLock,
  clearRunState,
  heartbeatHostLock,
  isStopped,
  readCheckpoint,
  releaseHostLock,
  resume,
  stop,
  writeCheckpoint,
} from "../scripts/verah-os/state.ts";

function issue(overrides = {}) {
  return {
    number: 90,
    title: "Entrega autorizada",
    body: "## Objetivo\nEntregar.\n## Escopo\nPequeno.\n## Critérios de aceite\nValidado.",
    url: "https://github.test/Verah-os/Verah-Command-Center/issues/90",
    state: "OPEN",
    createdAt: "2026-08-02T10:00:00.000Z",
    updatedAt: "2026-08-02T10:00:00.000Z",
    labels: ["codex:authorized", "codex:ready"],
    ...overrides,
  };
}

function config(runtimeDirectory, overrides = {}) {
  return {
    enabled: true,
    killSwitch: false,
    repository: "Verah-os/Verah-Command-Center",
    maintainers: new Set(["maintainer"]),
    maxDurationMs: 60_000,
    leaseDurationMs: 1_000,
    maxCorrectionAttempts: 2,
    runtimeDirectory,
    workspaceDirectory: process.cwd(),
    ...overrides,
  };
}

class FakeGitHub {
  constructor(issues, pullRequests = []) {
    this.issues = issues;
    this.pullRequests = pullRequests;
  }
  mutations = [];
  reservation = null;
  remoteSha = null;
  async listOpenIssues() {
    return structuredClone(this.issues);
  }
  async listOpenPullRequests() {
    return structuredClone(this.pullRequests);
  }
  async mainSha() {
    return "a".repeat(40);
  }
  async currentLogin() {
    return "maintainer";
  }
  async markInProgress(repository, issueNumber, comment) {
    this.mutations.push({ repository, issueNumber, comment });
  }
  async latestReservation() {
    return this.reservation;
  }
  async remoteBranchSha() {
    return this.remoteSha;
  }
}

function fakeWorkspace(overrides = {}) {
  return {
    async inspect() {
      return {
        currentBranch: "main",
        headSha: "a".repeat(40),
        selectedBranchSha: null,
        clean: true,
        ...overrides,
      };
    },
  };
}

test("selection requires executable labels and complete issue sections", () => {
  assert.equal(isExecutableIssue(issue()), true);
  assert.equal(isExecutableIssue(issue({ labels: ["codex:ready"] })), false);
  assert.equal(isExecutableIssue(issue({ body: "## Objetivo\nSem aceite" })), false);
  assert.equal(
    isExecutableIssue(issue({ labels: ["codex:authorized", "codex:ready", "codex:blocked"] })),
    false,
  );
});

test("selection is deterministic by priority, age and issue number", () => {
  const selected = selectNextIssue([
    issue({ number: 92, labels: ["codex:authorized", "codex:ready", "priority:p2"] }),
    issue({ number: 91, labels: ["codex:authorized", "codex:ready", "priority:p0"] }),
    issue({ number: 89, labels: ["codex:authorized", "codex:ready", "priority:p0"], createdAt: "2026-08-03T10:00:00.000Z" }),
  ]);
  assert.equal(selected.status, "selected");
  assert.equal(selected.issue.number, 91);
});

test("an existing global issue lock prevents another selection", () => {
  const selected = selectNextIssue([
    issue(),
    issue({ number: 88, labels: ["codex:in-progress"] }),
  ]);
  assert.equal(selected.status, "locked");
  assert.equal(selected.issue.number, 88);
});

test("release gates fail closed and require every stable check", () => {
  const passing = {
    state: "OPEN",
    isDraft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    behindBy: 0,
    unresolvedThreads: 0,
    sensitiveDiffFindings: 0,
    checks: {
      "CI / Application": "success",
      "CI / Database authorization": "success",
      "CI / Required": "success",
      Vercel: "success",
    },
  };
  assert.deepEqual(evaluateReleaseGates(passing), { allowed: true, blockers: [] });
  const blocked = evaluateReleaseGates({
    ...passing,
    behindBy: 1,
    checks: { ...passing.checks, Vercel: "pending" },
  });
  assert.equal(blocked.allowed, false);
  assert.deepEqual(blocked.blockers, ["branch_behind_main", "check_not_success:Vercel"]);
});

test("dry-run selects without effects or local checkpoint", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-os-dry-run-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const github = new FakeGitHub([issue()]);
  const result = await dryRunCycle(config(directory), github);
  assert.equal(result.status, "selected");
  assert.equal(result.issue.number, 90);
  assert.deepEqual(result.repositoryMutations, []);
  assert.deepEqual(result.productionMutations, []);
  assert.deepEqual(result.remoteDatabaseMutations, []);
  assert.equal(github.mutations.length, 0);
  assert.equal(await readCheckpoint(directory), null);
});

test("dry-run reads operating context and resumes the newest open PR", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-os-pr-dry-run-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const github = new FakeGitHub([issue()], [{
    number: 70,
    title: "Quote Intelligence Core",
    url: "https://github.test/pull/70",
    state: "OPEN",
    isDraft: true,
    headRefName: "feat/quote-intelligence-core",
    headRefOid: "b".repeat(40),
    updatedAt: "2026-08-02T13:00:00.000Z",
    labels: [],
  }]);
  const result = await dryRunCycle(
    config(directory),
    github,
  );
  assert.equal(result.status, "resumed");
  assert.equal(result.activePullRequest.number, 70);
  assert.equal(result.branch, "feat/quote-intelligence-core");
  assert.ok(result.contextDocuments.some((document) => document.path === "docs/verah-os/roadmap.md"));
  assert.deepEqual(result.repositoryMutations, []);
  assert.equal(await readCheckpoint(directory), null);
});

test("continue reserves once, blocks overlap and resumes after lease expiry", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-os-continue-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const github = new FakeGitHub([issue()]);
  const first = await continueCycle(config(directory), github, new Date("2026-08-02T12:00:00.000Z"));
  await assert.rejects(
    continueCycle(config(directory), github, new Date("2026-08-02T12:00:00.500Z")),
    /host_lock_occupied/,
  );
  const second = await continueCycle(config(directory), github, new Date("2026-08-02T12:00:02.000Z"));
  assert.equal(first.status, "selected");
  assert.equal(second.status, "resumed");
  assert.equal(first.baseSha, second.baseSha);
  assert.equal(github.mutations.length, 1);
  assert.equal((await readCheckpoint(directory)).issueNumber, 90);
  assert.deepEqual(first.productionMutations, []);
  assert.deepEqual(first.remoteDatabaseMutations, []);
});

test("continue resumes an existing PR without reserving duplicate issue work", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-os-pr-continue-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const github = new FakeGitHub([issue()], [{
    number: 70,
    title: "Quote Intelligence Core",
    url: "https://github.test/pull/70",
    state: "OPEN",
    isDraft: true,
    headRefName: "feat/quote-intelligence-core",
    headRefOid: "b".repeat(40),
    updatedAt: "2026-08-02T13:00:00.000Z",
    labels: [],
  }]);
  const result = await continueCycle(config(directory), github, new Date("2026-08-02T12:00:00.000Z"));
  assert.equal(result.status, "resumed");
  assert.equal(result.activePullRequest.number, 70);
  assert.equal(github.mutations.length, 0);
  const checkpoint = await readCheckpoint(directory);
  assert.equal(checkpoint.workType, "pull_request");
  assert.equal(checkpoint.pullRequestNumber, 70);
});

test("continue reconstructs an interrupted GitHub lock before local mutation", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-os-recover-before-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const lockedIssue = issue({
    number: 87,
    labels: ["codex:authorized", "codex:ready", "codex:in-progress"],
  });
  const github = new FakeGitHub([lockedIssue]);
  github.reservation = {
    maintainer: "maintainer",
    baseSha: "c".repeat(40),
    createdAt: "2026-08-02T11:59:30.000Z",
  };
  const result = await continueCycle(
    config(directory),
    github,
    new Date("2026-08-02T12:00:00.000Z"),
    fakeWorkspace(),
  );
  const checkpoint = await readCheckpoint(directory);
  assert.equal(result.status, "resumed");
  assert.equal(result.executionStatus, "recovering");
  assert.equal(checkpoint.issueNumber, 87);
  assert.equal(checkpoint.state, "planning");
  assert.equal(checkpoint.recoveryAttempts, 1);
  assert.equal(github.mutations.length, 0);
});

test("continue reconciles a pushed branch without duplicating commit or PR", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-os-recover-pushed-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const lockedIssue = issue({
    number: 87,
    labels: ["codex:authorized", "codex:ready", "codex:in-progress"],
  });
  const github = new FakeGitHub([lockedIssue]);
  github.reservation = {
    maintainer: "maintainer",
    baseSha: "c".repeat(40),
    createdAt: "2026-08-02T11:59:30.000Z",
  };
  github.remoteSha = "d".repeat(40);
  const result = await continueCycle(
    config(directory),
    github,
    new Date("2026-08-02T12:00:00.000Z"),
    fakeWorkspace({
      currentBranch: "feat/87-entrega-autorizada",
      selectedBranchSha: "d".repeat(40),
    }),
  );
  const checkpoint = await readCheckpoint(directory);
  assert.equal(result.status, "resumed");
  assert.equal(checkpoint.state, "testing");
  assert.equal(checkpoint.lastKnownRemoteHeadSha, "d".repeat(40));
  assert.equal(checkpoint.lastKnownPullRequestNumber, null);
  assert.equal(github.mutations.length, 0);
});

test("recovery fails closed for a lock owned by another maintainer", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-os-recover-owner-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const github = new FakeGitHub([
    issue({ labels: ["codex:authorized", "codex:ready", "codex:in-progress"] }),
  ]);
  github.reservation = {
    maintainer: "other-maintainer",
    baseSha: "c".repeat(40),
    createdAt: "2026-08-02T11:59:00.000Z",
  };
  const result = await continueCycle(
    config(directory),
    github,
    new Date("2026-08-02T12:00:00.000Z"),
    fakeWorkspace(),
  );
  assert.equal(result.status, "locked");
  assert.equal(result.executionStatus, "blocked");
  assert.equal(await readCheckpoint(directory), null);
});

test("recovery fails closed when authorization was revoked", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-os-recover-authorization-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const github = new FakeGitHub([
    issue({ labels: ["codex:ready", "codex:in-progress"] }),
  ]);
  const result = await continueCycle(
    config(directory),
    github,
    new Date("2026-08-02T12:00:00.000Z"),
    fakeWorkspace(),
  );
  assert.equal(result.status, "locked");
  assert.equal(result.executionStatus, "blocked");
  assert.equal(await readCheckpoint(directory), null);
});

test("continue rejects an empty or mismatched maintainer allowlist before mutation", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-os-maintainer-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const github = new FakeGitHub([issue()]);
  await assert.rejects(
    continueCycle(config(directory, { maintainers: new Set() }), github),
    /maintainer_not_authorized/,
  );
  github.currentLogin = async () => "other-maintainer";
  await assert.rejects(
    continueCycle(config(directory), github),
    /maintainer_not_authorized/,
  );
  assert.equal(github.mutations.length, 0);
  assert.equal(await readCheckpoint(directory), null);
});

test("an expired execution budget blocks resume", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-os-timeout-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const github = new FakeGitHub([issue()]);
  await continueCycle(config(directory, { leaseDurationMs: 180_000 }), github, new Date("2026-08-02T12:00:00.000Z"));
  await assert.rejects(
    continueCycle(config(directory), github, new Date("2026-08-02T12:02:00.000Z")),
    /timeout_exceeded/,
  );
  assert.equal(github.mutations.length, 1);
});

test("host lock is exclusive and an expired lease is reclaimed", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-os-lock-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const now = new Date("2026-08-02T12:00:00.000Z");
  const first = await acquireHostLock(directory, 1_000, now);
  await assert.rejects(acquireHostLock(directory, 1_000, now), /host_lock_occupied/);
  const reclaimed = await acquireHostLock(
    directory,
    1_000,
    new Date("2026-08-02T12:00:02.000Z"),
  );
  assert.notEqual(reclaimed.runId, first.runId);
  await assert.rejects(releaseHostLock(directory, first.runId), /host_lock_not_owned/);
  await releaseHostLock(directory, reclaimed.runId);
});

test("heartbeat renews only the owned live lease and completion clears state", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-os-heartbeat-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const now = new Date("2026-08-02T12:00:00.000Z");
  const lock = await acquireHostLock(directory, 1_000, now);
  const renewed = await heartbeatHostLock(
    directory,
    lock.runId,
    1_000,
    new Date("2026-08-02T12:00:00.500Z"),
  );
  assert.equal(renewed.expiresAt, "2026-08-02T12:00:01.500Z");
  await assert.rejects(
    heartbeatHostLock(directory, "not-owner", 1_000, now),
    /host_lock_not_owned/,
  );
  await clearRunState(directory, lock.runId);
  await assert.rejects(heartbeatHostLock(directory, lock.runId, 1_000, now), /ENOENT/);
});

test("status and health distinguish running, interrupted and idle", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-os-health-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const github = new FakeGitHub([issue()]);
  const started = await continueCycle(
    config(directory, { leaseDurationMs: 60_000 }),
    github,
    new Date(),
  );
  assert.equal(started.executionStatus, "running");
  const recoveryDryRun = await dryRunCycle(config(directory), github);
  assert.equal(recoveryDryRun.status, "resumed");
  assert.equal(recoveryDryRun.issue.number, 90);
  assert.deepEqual(recoveryDryRun.repositoryMutations, []);
  const running = await statusCycle(config(directory), github);
  assert.equal(running.executionStatus, "running");
  const health = await healthCycle(config(directory), fakeWorkspace());
  assert.equal(health.status, "running");
  await rm(join(directory, "host.lock"));
  const interrupted = await statusCycle(config(directory), github);
  assert.equal(interrupted.executionStatus, "interrupted");
  await rm(join(directory, "checkpoint.json"));
  await rm(join(directory, "checkpoint.previous.json"), { force: true });
  const idle = await healthCycle(config(directory), fakeWorkspace());
  assert.equal(idle.status, "idle");
});

test("checkpoint falls back to the previous atomic snapshot", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-os-checkpoint-backup-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const base = {
    version: 3,
    runId: "run-one",
    repository: "Verah-os/Verah-Command-Center",
    workType: "issue",
    issueNumber: 87,
    pullRequestNumber: null,
    workTitle: "Resilience",
    workUrl: "https://github.test/issues/87",
    baseSha: "a".repeat(40),
    branch: "feat/87-resilience",
    state: "planning",
    correctionAttempts: 0,
    recoveryAttempts: 0,
    lastKnownHeadSha: null,
    lastKnownRemoteHeadSha: null,
    lastKnownPullRequestNumber: null,
    startedAt: "2026-08-02T12:00:00.000Z",
    updatedAt: "2026-08-02T12:00:00.000Z",
  };
  await writeCheckpoint(directory, base);
  await writeCheckpoint(directory, { ...base, runId: "run-two" });
  await writeFile(join(directory, "checkpoint.json"), "not-json\n");
  assert.equal((await readCheckpoint(directory)).runId, "run-one");
});

test("audit log redacts secrets, phone numbers and personal paths", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-os-audit-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await appendAuditEvent(directory, {
    event: "recovered",
    at: "2026-08-02T12:00:00.000Z",
    issueNumber: 87,
    detail: `ghp_${"abcdefghijklmnop"} C:\\Users\\private\\token.txt +5511999999999`,
  });
  const content = await readFile(join(directory, "audit.jsonl"), "utf8");
  assert.doesNotMatch(content, new RegExp(`ghp_${"abcdefghijklmnop"}`));
  assert.doesNotMatch(content, /Users\\private/);
  assert.doesNotMatch(content, /5511999999999/);
  assert.match(content, /\[redacted\]/);
});

test("kill switch is fail-safe and stop/resume remain local", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-os-stop-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const github = new FakeGitHub([issue()]);
  const disabled = readVerahOsConfig({}, directory);
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.killSwitch, true);
  await stop(directory);
  assert.equal(await isStopped(directory), true);
  const result = await dryRunCycle(config(directory), github);
  assert.equal(result.status, "stopped");
  await resume(directory);
  assert.equal(await isStopped(directory), false);
  assert.equal(github.mutations.length, 0);
});

test("branch names are bounded and sanitized", () => {
  assert.equal(branchName(issue({ number: 71, title: "VERAH OS Core — Continuidade" })), "feat/71-verah-os-core-continuidade");
});

test("unattended skill and controller contain no remote database commands", async () => {
  const files = [
    "../.agents/skills/verah-os-unattended/SKILL.md",
    "../scripts/verah-os/cli.ts",
    "../scripts/verah-os/github.ts",
    "../scripts/verah-os/orchestrator.ts",
    "../scripts/verah-os/workspace.ts",
  ];
  for (const file of files) {
    const content = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(content, /supabase\s+db\s+push/i);
    assert.doesNotMatch(content, /migration\s+repair/i);
    assert.doesNotMatch(content, /pull_request_target/i);
  }
});
