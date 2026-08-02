import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readVerahOsConfig } from "../scripts/verah-os/config.ts";
import { continueCycle, dryRunCycle } from "../scripts/verah-os/orchestrator.ts";
import {
  branchName,
  evaluateReleaseGates,
  isExecutableIssue,
  selectNextIssue,
} from "../scripts/verah-os/policy.ts";
import {
  acquireHostLock,
  isStopped,
  readCheckpoint,
  releaseHostLock,
  resume,
  stop,
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
    maxCorrectionAttempts: 2,
    runtimeDirectory,
    ...overrides,
  };
}

class FakeGitHub {
  constructor(issues) {
    this.issues = issues;
  }
  mutations = [];
  async listOpenIssues() {
    return structuredClone(this.issues);
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

test("continue reserves once and later resumes the same checkpoint", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "verah-os-continue-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const github = new FakeGitHub([issue()]);
  const first = await continueCycle(config(directory), github, new Date("2026-08-02T12:00:00.000Z"));
  const second = await continueCycle(config(directory), github, new Date("2026-08-02T12:00:30.000Z"));
  assert.equal(first.status, "selected");
  assert.equal(second.status, "resumed");
  assert.equal(first.baseSha, second.baseSha);
  assert.equal(github.mutations.length, 1);
  assert.equal((await readCheckpoint(directory)).issueNumber, 90);
  assert.deepEqual(first.productionMutations, []);
  assert.deepEqual(first.remoteDatabaseMutations, []);
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
  await continueCycle(config(directory), github, new Date("2026-08-02T12:00:00.000Z"));
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
  ];
  for (const file of files) {
    const content = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(content, /supabase\s+db\s+push/i);
    assert.doesNotMatch(content, /migration\s+repair/i);
    assert.doesNotMatch(content, /pull_request_target/i);
  }
});
