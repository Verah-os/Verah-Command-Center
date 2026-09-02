import assert from "node:assert/strict";
import test from "node:test";

import {
  AgentRoleRegistry,
  GuardedControlPlane,
  InMemoryAgentLeaseStore,
} from "../services/control-plane/foundation.ts";
import { PolicyExecutorRouter } from "../services/control-plane/executor-router.ts";
import {
  buildOperationalReport,
  OPERATIONAL_SAFETY_POSTURE,
  renderOperationalReportMarkdown,
  serializeOperationalReport,
} from "../services/control-plane/operational-report.ts";
import {
  createFixtureReviewAgents,
  IndependentReviewGate,
} from "../services/control-plane/review-gates.ts";
import {
  LangflowControlPlaneAdapter,
  UnattendedControlPlaneQueue,
} from "../services/control-plane/unattended-queue.ts";
import { findSafetyViolations, runUnattendedDemo } from "../scripts/control-plane-unattended-demo.ts";

const task = (number, overrides = {}) => ({
  issueKey: `Verah-os/Verah-Command-Center#report-${number}`,
  idempotencyKey: `report-${number}`,
  title: `Synthetic report task ${number}`,
  roleId: "coding",
  kind: "isolated_code",
  branchName: `agent/report-${number}`,
  effects: ["local_files", "repository_branch", "sandbox"],
  contextRefs: ["AGENTS.md"],
  ...overrides,
});

function fakeExecutor(id, options = {}) {
  return {
    id,
    executions: [],
    async availability() {
      return options.availability ?? "available";
    },
    async execute(request) {
      this.executions.push(request.task.idempotencyKey);
      const result = typeof options.result === "function"
        ? options.result(request)
        : options.result;
      return result ?? {
        status: "completed",
        handoff: `${id} completed ${request.task.issueKey}`,
        costMicrounits: options.cost ?? 10,
        durationMs: options.durationMs ?? 7,
        artifacts: {
          draftPrUrl: `https://github.com/Verah-os/Verah-Command-Center/pull/${id}-${request.task.idempotencyKey}`,
          checks: [{ name: "Required", status: "passed" }],
        },
        externalEffects: [],
      };
    },
  };
}

function harness({ codex, openhands, queue = {} } = {}) {
  const router = new PolicyExecutorRouter([
    { executor: codex ?? fakeExecutor("codex", { cost: 30, durationMs: 11 }), priority: 1, estimatedCostMicrounits: 30 },
    { executor: openhands ?? fakeExecutor("openhands", { cost: 20, durationMs: 5 }), priority: 2, estimatedCostMicrounits: 20 },
  ]);
  const plane = new GuardedControlPlane(
    new AgentRoleRegistry(),
    new InMemoryAgentLeaseStore(),
    { async route() {
      return { provider: "fixture", model: "fixture-low", source: "internal", rationale: "ci" };
    } },
    { async loadContext(input) { return input.contextRefs ?? []; } },
    router,
    { enabled: true, killSwitch: false, dryRun: true, leaseTtlMs: 60_000 },
  );
  const unattended = new UnattendedControlPlaneQueue(
    plane,
    { enabled: true, killSwitch: false, dryRun: true, maxAttempts: 2, ...queue },
    new IndependentReviewGate(createFixtureReviewAgents()),
  );
  return { adapter: new LangflowControlPlaneAdapter(unattended), unattended };
}

test("operational report breaks down cost, duration and runs per executor and model", async () => {
  const codex = fakeExecutor("codex", { availability: "unavailable", cost: 30, durationMs: 11 });
  const openhands = fakeExecutor("openhands", { cost: 20, durationMs: 5 });
  const active = harness({ codex, openhands });
  active.adapter.accept({ source: "github", deliveryId: "a", task: task(1) });
  active.adapter.accept({ source: "github", deliveryId: "b", task: task(2) });
  await active.adapter.run();

  const report = buildOperationalReport({
    items: active.unattended.snapshot(),
    totals: active.unattended.report(),
    now: () => Date.parse("2026-09-01T12:00:00Z"),
  });

  assert.equal(report.schema, "verah.control-plane.operational-report/v1");
  assert.equal(report.environment, "non-production");
  assert.equal(report.generatedAt, "2026-09-01T12:00:00.000Z");
  assert.equal(report.totals.completed, 2);

  const openhandsMetric = report.perExecutor.find((metric) => metric.executorId === "openhands");
  assert.ok(openhandsMetric);
  assert.equal(openhandsMetric.runs, 2);
  assert.equal(openhandsMetric.reworkAttempts, 0);
  assert.equal(openhandsMetric.completed, 2);
  assert.equal(openhandsMetric.costMicrounits, 40);
  assert.equal(openhandsMetric.durationMs, 10);
  assert.deepEqual(openhandsMetric.models, [{
    provider: "fixture",
    model: "fixture-low",
    source: "internal",
    runs: 2,
    reworkAttempts: 0,
    costMicrounits: 40,
    durationMs: 10,
  }]);

  const codexMetric = report.perExecutor.find((metric) => metric.executorId === "codex");
  assert.equal(codexMetric, undefined);
  assert.equal(report.handoffCoverage.delivered, 2);
  assert.equal(report.sourceOfTruth.operational, "github");
  assert.equal(report.sourceOfTruth.memory, "read_only_non_authoritative");
});

test("HUMAN gates are recorded fail-closed with zero executor side effects", async () => {
  const codex = fakeExecutor("codex");
  const active = harness({ codex });
  active.adapter.accept({
    source: "github",
    deliveryId: "human",
    task: task(3, { effects: ["production_deploy"] }),
  });
  await active.adapter.run();

  const report = buildOperationalReport({
    items: active.unattended.snapshot(),
    totals: active.unattended.report(),
  });

  assert.equal(report.gates.human, 1);
  assert.equal(report.gates.humanBlockers.length, 1);
  assert.match(report.gates.humanBlockers[0], /high_risk_effect/);
  assert.equal(codex.executions.length, 0);
  assert.equal(report.totals.blocked, 1);
  assert.equal(report.totals.totalCostMicrounits, 0);
  const item = report.items[0];
  assert.equal(item.status, "blocked");
  assert.equal(item.externalEffects, 0);
});

test("duplicate GitHub delivery yields a single execution in the report", async () => {
  const codex = fakeExecutor("codex");
  const active = harness({ codex });
  active.adapter.accept({ source: "github", deliveryId: "one", task: task(4) });
  const duplicate = active.adapter.accept({ source: "github", deliveryId: "two", task: task(4) });
  assert.equal(duplicate.deduplicated, true);
  await active.adapter.run();

  const report = buildOperationalReport({
    items: active.unattended.snapshot(),
    totals: active.unattended.report(),
  });

  assert.equal(report.items.length, 1);
  assert.equal(report.totals.totalRuns, 1);
  assert.equal(codex.executions.length, 1);
});

test("rework attempts are attributed to the retrying executor", async () => {
  const codex = fakeExecutor("codex", {
    result: { status: "failed", errorCode: "flaky", externalEffects: [] },
  });
  const active = harness({ codex });
  active.adapter.accept({ source: "github", deliveryId: "flaky", task: task(5) });
  await active.adapter.run();

  const report = buildOperationalReport({
    items: active.unattended.snapshot(),
    totals: active.unattended.report(),
  });

  assert.equal(report.totals.deadLetter, 1);
  assert.equal(report.totals.reworkAttempts, 1);
  const codexMetric = report.perExecutor.find((metric) => metric.executorId === "codex");
  assert.equal(codexMetric.failedRecoverable, 2);
  assert.equal(codexMetric.reworkAttempts, 1);
  assert.deepEqual(
    codexMetric.models.map((model) => [model.model, model.runs, model.reworkAttempts]),
    [["fixture-low", 2, 1]],
  );
  assert.equal(report.items[0].attempts, 2);
});

test("attempted executor side effects count as demo safety violations", async () => {
  const codex = fakeExecutor("codex", {
    result: {
      status: "completed",
      handoff: "attempted a real side effect",
      externalEffects: ["sent_real_whatsapp_message"],
    },
  });
  const active = harness({ codex });
  active.adapter.accept({ source: "github", deliveryId: "side-effect", task: task(10) });
  await active.adapter.run();

  const snapshot = active.unattended.snapshot();
  const runs = snapshot[0].runs;
  assert.equal(runs.length, 2);
  for (const run of runs) {
    // GuardedControlPlane sanitizes recorded externalEffects into the blocker.
    assert.equal(run.externalEffects.length, 0);
    assert.equal(run.blocker, "executor_side_effect_contract_violation");
  }

  const report = buildOperationalReport({
    items: snapshot,
    totals: active.unattended.report(),
  });
  const violations = findSafetyViolations(report, snapshot);
  assert.deepEqual(
    violations.filter((violation) => violation.startsWith("attempted_external_effects:")),
    runs.map((run) => `attempted_external_effects:${run.id}`),
  );
});

test("kill switch keeps the report halted with no runs", async () => {
  const codex = fakeExecutor("codex");
  const plane = new GuardedControlPlane(
    new AgentRoleRegistry(),
    new InMemoryAgentLeaseStore(),
    { async route() {
      return { provider: "fixture", model: "fixture-low", source: "internal", rationale: "ci" };
    } },
    { async loadContext(input) { return input.contextRefs ?? []; } },
    codex,
    { enabled: true, killSwitch: false, dryRun: true, leaseTtlMs: 60_000 },
  );
  const halted = new UnattendedControlPlaneQueue(
    plane,
    { enabled: true, killSwitch: true, dryRun: true },
  );
  halted.enqueue({ source: "github", deliveryId: "halted", task: task(6) });
  await halted.drain();

  const report = buildOperationalReport({ items: halted.snapshot(), totals: halted.report() });
  assert.equal(report.killSwitchActive, true);
  assert.equal(report.totals.totalRuns, 0);
  assert.equal(report.items[0].status, "queued");
});

test("markdown rendering covers totals, gates, executors, items and safety posture", async () => {
  const codex = fakeExecutor("codex", { availability: "unavailable" });
  const active = harness({ codex });
  active.adapter.accept({ source: "github", deliveryId: "md", task: task(7) });
  active.adapter.accept({
    source: "github",
    deliveryId: "md-human",
    task: task(8, { effects: ["real_payment"] }),
  });
  await active.adapter.run();

  const markdown = renderOperationalReportMarkdown(buildOperationalReport({
    items: active.unattended.snapshot(),
    totals: active.unattended.report(),
  }));

  for (const section of [
    "# VERAH Control Plane — Operational Report",
    "## Totals",
    "## Gates",
    "## Per-executor metrics",
    "## Queue items",
    "## Sources of truth",
    "## Safety posture",
  ]) {
    assert.ok(markdown.includes(section), `missing section: ${section}`);
  }
  assert.match(markdown, /HUMAN \(fail-closed, never executed\): 1/);
  assert.match(markdown, /openhands: runs=1 rework=0 completed=1/);
  assert.match(markdown, /model fixture\/fixture-low \(internal\): runs=1 rework=0/);
  for (const rule of OPERATIONAL_SAFETY_POSTURE) {
    assert.ok(markdown.includes(`- ${rule}`), `missing safety rule: ${rule}`);
  }
});

test("serialized report is sanitized and never carries secrets", async () => {
  const codex = fakeExecutor("codex", {
    result: {
      status: "completed",
      handoff: "leak ghp_abcdefghijklmnopqrstuvwxyz0123456789 token",
      costMicrounits: 10,
      durationMs: 5,
      artifacts: {
        draftPrUrl: "https://github.com/Verah-os/Verah-Command-Center/pull/1",
        checks: [{ name: "Required", status: "passed" }],
      },
      externalEffects: [],
    },
  });
  const active = harness({ codex });
  active.adapter.accept({ source: "github", deliveryId: "leak", task: task(9) });
  await active.adapter.run();

  const json = serializeOperationalReport(buildOperationalReport({
    items: active.unattended.snapshot(),
    totals: active.unattended.report(),
  }));
  assert.ok(!json.includes("ghp_abcdefghijklmnopqrstuvwxyz0123456789"));

  const auditRun = active.unattended.snapshot()[0].runs[0];
  assert.ok(auditRun.handoff.includes("[redacted-secret]"));
});

test("end-to-end unattended demo completes with zero safety violations", async () => {
  const result = await runUnattendedDemo(() => Date.parse("2026-09-01T12:00:00Z"));

  assert.deepEqual(result.safetyViolations, []);
  assert.equal(result.report.totals.completed, 1);
  assert.equal(result.report.totals.blocked, 1);
  assert.equal(result.report.totals.deadLetter, 1);
  assert.equal(result.report.totals.reworkAttempts, 1);
  assert.equal(result.report.gates.human, 1);
  assert.equal(result.report.items.length, 3);

  const fallback = result.report.items.find((item) => item.issueKey.endsWith("#demo-1"));
  assert.equal(fallback.status, "completed");
  assert.deepEqual(fallback.executors, ["openhands"]);
  assert.equal(fallback.handoffDelivered, true);
  assert.ok(fallback.draftPrUrl.startsWith("https://github.com/Verah-os/Verah-Command-Center/pull/"));
  assert.deepEqual(fallback.checks, [{ name: "Required", status: "passed" }]);
  assert.equal(fallback.reviewGate, "passed");

  const human = result.report.items.find((item) => item.issueKey.endsWith("#demo-2"));
  assert.equal(human.status, "blocked");
  assert.equal(human.handoffDelivered, false);
  assert.equal(human.externalEffects, 0);

  const branches = result.report.items.map((item) => item.branchName);
  assert.equal(new Set(branches).size, branches.length);

  const openhandsMetric = result.report.perExecutor.find((metric) => metric.executorId === "openhands");
  assert.ok(openhandsMetric);
  assert.equal(openhandsMetric.runs, 3);
  assert.equal(openhandsMetric.reworkAttempts, 1);
  assert.equal(openhandsMetric.models.reduce((total, model) => total + model.reworkAttempts, 0), 1);

  assert.ok(result.markdown.includes("## Per-executor metrics"));
  assert.ok(result.json.includes('"environment": "non-production"'));
});
