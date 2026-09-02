import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  issueToQueueEvent,
  readControlPlaneRuntimeConfig,
} from "../services/control-plane/github-queue.ts";
import { createControlPlaneRuntime } from "../services/control-plane/runtime.ts";

const enabledEnv = (overrides = {}) => ({
  NODE_ENV: "development",
  CONTROL_PLANE_RUNTIME_ENABLED: "true",
  CONTROL_PLANE_KILL_SWITCH: "false",
  GITHUB_TOKEN: "test-token-not-a-real-secret",
  ...overrides,
});

const spyExecutor = (overrides = {}) => ({
  id: "spy-executor",
  availabilityCalls: 0,
  executions: [],
  tasks: [],
  async availability(task) {
    this.availabilityCalls += 1;
    return "available";
  },
  async execute(request) {
    this.executions.push(request.task.idempotencyKey);
    this.tasks.push(request.task);
    return {
      status: "completed",
      handoff: "spy handoff",
      costMicrounits: 10,
      durationMs: 5,
      artifacts: {
        draftPrUrl: "https://github.com/Verah-os/Verah-Command-Center/pull/900",
        checks: [{ name: "Required", status: "passed" }],
      },
      externalEffects: [],
      ...overrides,
    };
  },
});

const eligibleIssue = (overrides = {}) => ({
  number: 169,
  title: "Auth Mobile (M1)",
  body: "## Objetivo\nLogin.\n\n## Escopo\n- telas\n\n## Critérios de aceite\n- sessão\n",
  html_url: "https://github.com/Verah-os/Verah-Command-Center/issues/169",
  state: "open",
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-02T00:00:00Z",
  labels: [{ name: "codex:authorized" }, { name: "codex:ready" }],
  ...overrides,
});

// Routes the stubbed GitHub API: issues list vs. open-PR branch check.
const githubFetch = ({ issues = [], pulls = [], calls = [] } = {}) => {
  return Object.assign(
    async (url, init) => {
      calls.push({ url, authorization: init.headers.authorization });
      const payload = url.includes("/pulls?") ? pulls : issues;
      return { ok: true, status: 200, json: async () => payload };
    },
    { calls },
  );
};

test("runtime config is fail-closed: production, flag, kill switch, token, repository", () => {
  assert.deepEqual(readControlPlaneRuntimeConfig({}), {
    enabled: false,
    reason: "flag_disabled",
  });
  assert.deepEqual(
    readControlPlaneRuntimeConfig(enabledEnv({ NODE_ENV: "production" })),
    { enabled: false, reason: "production_environment" },
  );
  assert.deepEqual(
    readControlPlaneRuntimeConfig(enabledEnv({ CONTROL_PLANE_KILL_SWITCH: undefined })),
    { enabled: false, reason: "kill_switch_active" },
  );
  assert.deepEqual(
    readControlPlaneRuntimeConfig(enabledEnv({ GITHUB_TOKEN: " ", GH_TOKEN: undefined })),
    { enabled: false, reason: "github_token_missing" },
  );
  assert.deepEqual(
    readControlPlaneRuntimeConfig(enabledEnv({ CONTROL_PLANE_REPOSITORY: "no-slash" })),
    { enabled: false, reason: "repository_invalid" },
  );
  const enabled = readControlPlaneRuntimeConfig(enabledEnv());
  assert.equal(enabled.enabled, true);
  if (enabled.enabled) {
    assert.equal(enabled.repository, "Verah-os/Verah-Command-Center");
    assert.equal(enabled.maxCycles, 1);
    assert.equal(enabled.branchPrefix, "control-plane/issue-");
  }
});

test("no executor with missing config: runtime refuses instead of building an empty router", () => {
  // Valid runtime config but no OpenHands Cloud credentials and no primary
  // candidates: createControlPlaneExecutorRouter returns null, so the
  // runtime must refuse.
  assert.equal(createControlPlaneRuntime(enabledEnv()), null);
  // Production stays fail-closed even with a candidate available.
  assert.equal(
    createControlPlaneRuntime(enabledEnv({ NODE_ENV: "production" }), {
      primaryCandidates: [{ executor: spyExecutor(), priority: 1, estimatedCostMicrounits: 10 }],
    }),
    null,
  );
});

test("runtime never imports or invokes the dispatcher path", async () => {
  for (const file of [
    "../services/control-plane/runtime.ts",
    "../services/control-plane/github-queue.ts",
    "../scripts/control-plane-runtime.ts",
  ]) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /verah-os\/dispatcher/, `dispatcher reference in ${file}`);
    assert.doesNotMatch(source, /dispatcher-cli/, `dispatcher CLI reference in ${file}`);
  }
});

test("HUMAN-gated task stays blocked and never reaches an executor", async () => {
  const spy = spyExecutor();
  const runtime = createControlPlaneRuntime(enabledEnv(), {
    primaryCandidates: [{ executor: spy, priority: 1, estimatedCostMicrounits: 10 }],
    fetchFn: githubFetch({ issues: [] }),
  });
  assert.ok(runtime);
  runtime.queue.enqueue({
    source: "github",
    deliveryId: "human-delivery-1",
    task: {
      issueKey: "Verah-os/Verah-Command-Center#999",
      idempotencyKey: "human-delivery-1",
      title: "Wire real payments",
      roleId: "coding",
      kind: "isolated_code",
      branchName: "control-plane/issue-999",
      effects: ["real_payment"],
    },
  });

  const cycle = await runtime.runCycle(1);
  assert.equal(cycle.selectedIssueKey, null);
  const [item] = runtime.queue.snapshot();
  assert.equal(item.status, "blocked");
  assert.equal(item.runs[0].gate, "HUMAN");
  assert.equal(item.runs[0].blocker, "high_risk_effect");
  assert.equal(spy.availabilityCalls, 0);
  assert.equal(spy.executions.length, 0);
  const report = runtime.report();
  assert.equal(report.environment, "non-production");
  assert.equal(report.gates.human, 1);
});

test("synthetic eligible GitHub issue reaches the existing executor router", async () => {
  const spy = spyExecutor();
  const fetchFn = githubFetch({ issues: [eligibleIssue()] });
  const runtime = createControlPlaneRuntime(enabledEnv(), {
    primaryCandidates: [{ executor: spy, priority: 1, estimatedCostMicrounits: 10 }],
    fetchFn,
  });
  assert.ok(runtime);

  const cycle = await runtime.runCycle(1);
  assert.equal(cycle.queueStatus, "ready");
  assert.equal(cycle.selectedIssueKey, "Verah-os/Verah-Command-Center#169");
  assert.equal(spy.executions.length, 1);
  assert.equal(spy.tasks[0].branchName, "control-plane/issue-169");
  assert.equal(spy.tasks[0].issueKey, "Verah-os/Verah-Command-Center#169");
  assert.equal(spy.tasks[0].kind, "isolated_code");
  assert.deepEqual(spy.tasks[0].effects, ["local_files", "repository_branch", "sandbox"]);

  const [item] = runtime.queue.snapshot();
  assert.equal(item.status, "completed");
  assert.equal(item.runs[0].executorId, "spy-executor");
  assert.equal(item.reviewGate.status, "passed");
  assert.equal(cycle.report.completed, 1);

  // One Issue -> one executor -> one isolated branch: the same issue is never
  // re-delegated in the same process.
  const second = await runtime.runCycle(2);
  assert.equal(second.selectedIssueKey, null);
  assert.equal(second.skippedReason, "no_eligible_issue");
  assert.equal(spy.executions.length, 1);

  // The GitHub token is used for the queue read and the branch PR check only.
  assert.equal(fetchFn.calls.length >= 2, true);
  for (const call of fetchFn.calls) {
    assert.equal(call.authorization, "Bearer test-token-not-a-real-secret");
  }
});

test("restart safety: an open PR on the lease branch blocks re-delegation", async () => {
  const spy = spyExecutor();
  const runtime = createControlPlaneRuntime(enabledEnv(), {
    primaryCandidates: [{ executor: spy, priority: 1, estimatedCostMicrounits: 10 }],
    fetchFn: githubFetch({
      issues: [eligibleIssue()],
      pulls: [{ number: 900 }],
    }),
  });
  assert.ok(runtime);
  const cycle = await runtime.runCycle(1);
  assert.equal(cycle.selectedIssueKey, null);
  assert.equal(cycle.skippedReason, "branch_already_delegated");
  assert.equal(spy.executions.length, 0);
});

test("repository-wide delivery lock pauses selection", async () => {
  const spy = spyExecutor();
  const runtime = createControlPlaneRuntime(enabledEnv(), {
    primaryCandidates: [{ executor: spy, priority: 1, estimatedCostMicrounits: 10 }],
    fetchFn: githubFetch({
      issues: [
        eligibleIssue(),
        eligibleIssue({
          number: 42,
          labels: [{ name: "codex:in-progress" }],
        }),
      ],
    }),
  });
  assert.ok(runtime);
  const cycle = await runtime.runCycle(1);
  assert.equal(cycle.queueStatus, "locked");
  assert.equal(cycle.selectedIssueKey, null);
  assert.equal(spy.executions.length, 0);
});

// Normalized VerahIssue shape (post-intake) for direct mapping assertions.
const verahIssue = (overrides = {}) => ({
  number: 169,
  title: "Auth Mobile (M1)",
  body: "## Objetivo\nLogin.\n\n## Escopo\n- telas\n\n## Critérios de aceite\n- sessão\n",
  url: "https://github.com/Verah-os/Verah-Command-Center/issues/169",
  state: "OPEN",
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-02T00:00:00Z",
  labels: ["codex:authorized", "codex:ready"],
  ...overrides,
});

test("intake maps labels to gate kinds and skips non-issues", async () => {
  const config = readControlPlaneRuntimeConfig(enabledEnv());
  assert.equal(config.enabled, true);
  if (!config.enabled) return;

  const kindFor = (labels) =>
    issueToQueueEvent(verahIssue({ labels }), config).task.kind;
  assert.equal(
    kindFor(["codex:authorized", "codex:ready", "documentation"]),
    "documentation",
  );
  assert.equal(kindFor(["codex:authorized", "codex:ready", "frontend"]), "isolated_ui");
  assert.equal(kindFor(["codex:authorized", "codex:ready", "database"]), "migration_file");
  assert.equal(kindFor(["codex:authorized", "codex:ready", "security"]), "authorization");
  assert.equal(kindFor(["codex:authorized", "codex:ready"]), "isolated_code");

  const event = issueToQueueEvent(verahIssue(), config);
  assert.equal(event.source, "github");
  assert.equal(event.deliveryId.includes("#169@"), true);
  assert.deepEqual(event.task.contextRefs, [
    "AGENTS.md",
    "https://github.com/Verah-os/Verah-Command-Center/issues/169",
  ]);

  // Issues API also returns PRs and closed items: neither is eligible.
  const fetchFn = githubFetch({
    issues: [
      eligibleIssue(),
      eligibleIssue({ number: 170, pull_request: { url: "x" } }),
      eligibleIssue({ number: 171, state: "closed" }),
      eligibleIssue({ number: 172, labels: [{ name: "codex:ready" }] }),
    ],
  });
  const { fetchOperationalQueue } = await import("../services/control-plane/github-queue.ts");
  const queue = await fetchOperationalQueue(config, { fetchFn });
  assert.equal(queue.status, "ready");
  if (queue.status === "ready") {
    assert.deepEqual(queue.candidates.map((issue) => issue.number), [169]);
  }
});
