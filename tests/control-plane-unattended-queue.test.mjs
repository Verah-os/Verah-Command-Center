import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AgentRoleRegistry,
  GuardedControlPlane,
  InMemoryAgentLeaseStore,
} from "../services/control-plane/foundation.ts";
import { PolicyExecutorRouter } from "../services/control-plane/executor-router.ts";
import {
  LangflowControlPlaneAdapter,
  UnattendedControlPlaneQueue,
} from "../services/control-plane/unattended-queue.ts";

const task = (number, overrides = {}) => ({
  issueKey: `Verah-os/Verah-Command-Center#synthetic-${number}`,
  idempotencyKey: `synthetic-${number}`,
  title: `Synthetic task ${number}`,
  roleId: "coding",
  kind: "isolated_code",
  effects: ["local_files", "repository_branch", "sandbox"],
  contextRefs: ["AGENTS.md", `fixture:${number}`],
  ...overrides,
});

function fakeExecutor(id, options = {}) {
  return {
    id,
    availabilityCalls: 0,
    executions: [],
    async availability(input) {
      this.availabilityCalls += 1;
      return typeof options.availability === "function"
        ? options.availability(input)
        : options.availability ?? "available";
    },
    async execute(request) {
      this.executions.push(request.task.idempotencyKey);
      const result = typeof options.result === "function"
        ? options.result(request)
        : options.result;
      return result ?? {
        status: "completed",
        handoff: `${id} completed fixture`,
        costMicrounits: options.cost ?? 10,
        durationMs: 5,
        externalEffects: [],
      };
    },
  };
}

function harness({ codex, openhands, mode = "priority", queue = {} }) {
  const leases = new InMemoryAgentLeaseStore();
  const router = new PolicyExecutorRouter([
    {
      executor: codex,
      priority: 1,
      estimatedCostMicrounits: 30,
      taskKinds: ["isolated_code", "test", "shared_contract"],
    },
    {
      executor: openhands,
      priority: 2,
      estimatedCostMicrounits: 20,
      taskKinds: ["isolated_code", "test"],
    },
  ], mode);
  const plane = new GuardedControlPlane(
    new AgentRoleRegistry(),
    leases,
    { async route() {
      return { provider: "fixture", model: "fixture", source: "internal", rationale: "ci" };
    } },
    { async loadContext(input) { return input.contextRefs ?? []; } },
    router,
    { enabled: true, killSwitch: false, dryRun: true, leaseTtlMs: 60_000 },
  );
  const unattended = new UnattendedControlPlaneQueue(plane, {
    enabled: true,
    killSwitch: false,
    dryRun: true,
    maxAttempts: 2,
    ...queue,
  });
  return { adapter: new LangflowControlPlaneAdapter(unattended), unattended, leases };
}

test("Codex unavailable falls back to OpenHands inside one lease", async () => {
  const codex = fakeExecutor("codex", { availability: "unavailable" });
  const openhands = fakeExecutor("openhands");
  const active = harness({ codex, openhands });
  active.adapter.accept({ source: "github", deliveryId: "delivery-1", task: task(1) });
  const report = await active.adapter.run();
  const item = active.unattended.snapshot()[0];
  assert.equal(report.completed, 1);
  assert.equal(item.runs[0].executorId, "openhands");
  assert.equal(codex.executions.length, 0);
  assert.equal(openhands.executions.length, 1);
  assert.equal(active.leases.audit.filter((event) => event.type === "lease_acquired").length, 1);
  assert.equal(active.leases.audit.at(-1).type, "lease_released");
});

test("all executors unavailable leaves one recoverable attempt", async () => {
  const active = harness({
    codex: fakeExecutor("codex", { availability: "unavailable" }),
    openhands: fakeExecutor("openhands", { availability: "unavailable" }),
  });
  active.adapter.accept({ source: "github", deliveryId: "delivery-2", task: task(2) });
  const item = await active.unattended.processNext();
  assert.equal(item.status, "retryable");
  assert.equal(item.attempts, 1);
  assert.equal(item.blocker, "executor_unavailable");
  assert.equal(active.leases.audit.at(-1).type, "lease_released");
});

test("duplicate GitHub events produce one effective execution", async () => {
  const codex = fakeExecutor("codex");
  const active = harness({ codex, openhands: fakeExecutor("openhands") });
  const event = { source: "github", deliveryId: "same-delivery", task: task(3) };
  assert.equal(active.adapter.accept(event).deduplicated, false);
  assert.equal(active.adapter.accept(event).deduplicated, true);
  await active.adapter.run();
  assert.equal(codex.executions.length, 1);
  assert.equal(active.unattended.snapshot().length, 1);
});

test("HUMAN gate blocks with zero executor side effects", async () => {
  const codex = fakeExecutor("codex");
  const openhands = fakeExecutor("openhands");
  const active = harness({ codex, openhands });
  const accepted = active.adapter.accept({
    source: "github",
    deliveryId: "human-delivery",
    task: task(4, { effects: ["real_payment"] }),
  });
  assert.equal(accepted.gate.gate, "HUMAN");
  const report = await active.adapter.run();
  assert.equal(report.blocked, 1);
  assert.equal(codex.availabilityCalls, 0);
  assert.equal(openhands.availabilityCalls, 0);
  assert.equal(codex.executions.length + openhands.executions.length, 0);
});

test("released lease allows the next independent issue to start", async () => {
  const active = harness({
    codex: fakeExecutor("codex"),
    openhands: fakeExecutor("openhands"),
  });
  active.adapter.accept({ source: "github", deliveryId: "first", task: task(5) });
  active.adapter.accept({ source: "github", deliveryId: "second", task: task(6) });
  await active.adapter.run();
  const leaseTypes = active.leases.audit.map((event) => event.type);
  assert.deepEqual(leaseTypes, [
    "lease_acquired", "lease_released", "lease_acquired", "lease_released",
  ]);
  assert.equal(active.adapter.report().completed, 2);
});

test("persistent executor failure moves to dead-letter without an infinite loop", async () => {
  const failing = fakeExecutor("codex", {
    result: {
      status: "failed",
      errorCode: "persistent_fixture_failure",
      externalEffects: [],
    },
  });
  const active = harness({ failing, codex: failing, openhands: fakeExecutor("openhands") });
  active.adapter.accept({ source: "github", deliveryId: "dead-letter", task: task(7, {
    kind: "shared_contract",
  }) });
  const report = await active.adapter.run();
  const item = active.unattended.snapshot()[0];
  assert.equal(report.deadLetter, 1);
  assert.equal(item.attempts, 2);
  assert.equal(failing.executions.length, 2);
  assert.equal(item.runs.every((run) => run.status === "failed_recoverable"), true);
});

test("kill switch defaults active and arbitrary commands are rejected", async () => {
  const codex = fakeExecutor("codex");
  const leases = new InMemoryAgentLeaseStore();
  const plane = new GuardedControlPlane(
    new AgentRoleRegistry(), leases,
    { async route() { throw new Error("must_not_route"); } },
    { async loadContext() { throw new Error("must_not_load"); } },
    codex,
    { enabled: true, killSwitch: false, dryRun: true },
  );
  const queue = new UnattendedControlPlaneQueue(plane);
  const adapter = new LangflowControlPlaneAdapter(queue);
  adapter.accept({ source: "github", deliveryId: "killed", task: task(8) });
  assert.equal((await adapter.run()).killSwitchActive, true);
  assert.equal(codex.executions.length, 0);
  assert.throws(() => adapter.accept({
    source: "github", deliveryId: "command", task: task(9), command: "rm everything",
  }), /arbitrary_commands_forbidden/);
  assert.throws(() => adapter.accept({
    source: "github", deliveryId: "nested-command",
    task: { ...task(9), command: "rm everything" },
  }), /arbitrary_commands_forbidden/);
});

test("three-task unattended fixture reports fallback, HUMAN block and dead-letter", async () => {
  const codex = fakeExecutor("codex", { availability: "unavailable" });
  const openhands = fakeExecutor("openhands", {
    result: (input) => input.task.title.includes("persistent")
      ? { status: "failed", errorCode: "fixture_persistent", externalEffects: [] }
      : { status: "completed", handoff: "safe", externalEffects: [], costMicrounits: 20 },
  });
  const active = harness({ codex, openhands });
  active.adapter.accept({ source: "github", deliveryId: "safe", task: task(10) });
  active.adapter.accept({
    source: "github", deliveryId: "human", task: task(11, { effects: ["production_deploy"] }),
  });
  active.adapter.accept({
    source: "github", deliveryId: "persistent", task: task(12, { title: "persistent fixture" }),
  });
  const report = await active.adapter.run();
  assert.deepEqual(report, {
    queued: 0,
    retryable: 0,
    completed: 1,
    blocked: 1,
    deadLetter: 1,
    totalRuns: 4,
    killSwitchActive: false,
  });
});

test("cost and task-kind policies remain versioned outside Langflow UI", async () => {
  const expensive = fakeExecutor("codex");
  const cheap = fakeExecutor("openhands");
  const active = harness({ codex: expensive, openhands: cheap, mode: "lowest_cost" });
  active.adapter.accept({ source: "github", deliveryId: "cost", task: task(13) });
  await active.adapter.run();
  assert.equal(active.unattended.snapshot()[0].runs[0].executorId, "openhands");

  const shared = harness({ codex: expensive, openhands: cheap, mode: "lowest_cost" });
  shared.adapter.accept({
    source: "github", deliveryId: "kind", task: task(14, { kind: "shared_contract" }),
  });
  await shared.adapter.run();
  assert.equal(shared.unattended.snapshot()[0].runs[0].executorId, "codex");

  const specification = JSON.parse(await readFile(
    new URL("../flows/langflow/control-plane-unattended-v1.json", import.meta.url),
    "utf8",
  ));
  assert.equal(specification.domainImplementation, "services/control-plane/unattended-queue.ts");
  assert.equal(specification.policy.criticalLogicInUi, false);
  assert.equal(specification.policy.killSwitchDefault, true);
});
