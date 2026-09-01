import assert from "node:assert/strict";
import test from "node:test";

import {
  AgentRoleRegistry,
  GuardedControlPlane,
  InMemoryAgentLeaseStore,
  classifyControlPlaneGate,
} from "../services/control-plane/foundation.ts";

const task = (overrides = {}) => ({
  issueKey: "Verah-os/Verah-Command-Center#148",
  idempotencyKey: "issue-148-attempt-1",
  title: "Control Plane foundation",
  roleId: "coding",
  kind: "shared_contract",
  effects: ["local_files", "repository_branch"],
  contextRefs: ["github:#148", "adr:008"],
  ...overrides,
});

function harness(overrides = {}) {
  let executions = 0;
  const executor = {
    id: overrides.executorId ?? "fake-codex",
    async availability() {
      return overrides.availability ?? "available";
    },
    async execute(request) {
      executions += 1;
      assert.equal(request.dryRun, true);
      if (overrides.throwError) throw new Error("synthetic_executor_crash");
      return overrides.result ?? {
        status: "completed",
        handoff: "safe handoff",
        costMicrounits: 42,
        externalEffects: [],
      };
    },
  };
  const modelRouter = overrides.modelRouter ?? {
    async route() {
      return {
        provider: "fake-provider",
        model: "fake-model",
        source: "internal",
        rationale: "deterministic-ci-route",
      };
    },
  };
  const memory = overrides.memory ?? {
    async loadContext(input) {
      return input.contextRefs ?? [];
    },
  };
  const leases = overrides.leases ?? new InMemoryAgentLeaseStore();
  const plane = new GuardedControlPlane(
    overrides.roles ?? new AgentRoleRegistry(),
    leases,
    modelRouter,
    memory,
    executor,
    {
      enabled: true,
      killSwitch: false,
      dryRun: true,
      leaseTtlMs: 60_000,
      now: overrides.now ?? (() => Date.parse("2026-09-01T01:20:00.000Z")),
      ...overrides.options,
    },
  );
  return { plane, leases, executions: () => executions };
}

test("two workers claiming the same issue produce one lease", async () => {
  const leases = new InMemoryAgentLeaseStore();
  const now = Date.parse("2026-09-01T01:20:00.000Z");
  const [first, second] = await Promise.all([
    Promise.resolve().then(() => leases.claim("repo#148", "codex", "run-1", now, 60_000)),
    Promise.resolve().then(() => leases.claim("repo#148", "openhands", "run-2", now, 60_000)),
  ]);
  assert.equal([first, second].filter((claim) => claim.acquired).length, 1);
  assert.equal(second.lease.id, first.lease.id);
});

test("expired lease is recovered with an audit event", () => {
  const leases = new InMemoryAgentLeaseStore();
  const now = Date.parse("2026-09-01T01:20:00.000Z");
  const first = leases.claim("repo#148", "codex", "run-1", now, 1_000);
  const recovered = leases.claim("repo#148", "openhands", "run-2", now + 1_001, 60_000);
  assert.equal(recovered.acquired, true);
  assert.equal(recovered.recoveredLeaseId, first.lease.id);
  assert.equal(leases.audit.at(-1).type, "lease_recovered");
});

test("gate classification is fail closed and HUMAN never invokes executor", async () => {
  assert.deepEqual(classifyControlPlaneGate(task({ kind: "test" })), {
    gate: "AUTO",
    reason: "isolated_safe_scope",
  });
  assert.deepEqual(classifyControlPlaneGate(task()), {
    gate: "AUTO_PR",
    reason: "review_required_scope",
  });
  assert.equal(classifyControlPlaneGate(task({ effects: ["real_payment"] })).gate, "HUMAN");
  assert.equal(classifyControlPlaneGate(task({ kind: "new-kind" })).gate, "HUMAN");

  const active = harness();
  const run = await active.plane.run(task({ effects: ["production_deploy"] }));
  assert.equal(run.status, "blocked");
  assert.equal(run.gate, "HUMAN");
  assert.equal(active.executions(), 0);
});

test("kill switch and mutable mode block before side effects", async () => {
  const killed = harness({ options: { killSwitch: true } });
  assert.equal((await killed.plane.run(task())).blocker, "kill_switch_active");
  assert.equal(killed.executions(), 0);

  const mutable = harness({ options: { dryRun: false } });
  assert.equal((await mutable.plane.run(task())).blocker, "dry_run_required");
  assert.equal(mutable.executions(), 0);
});

test("idempotent retry returns the same run and executes once", async () => {
  const active = harness();
  const first = await active.plane.run(task());
  const retry = await active.plane.run(task());
  assert.equal(first.id, retry.id);
  assert.equal(retry.deduplicated, true);
  assert.equal(active.executions(), 1);
  assert.deepEqual(first.externalEffects, []);
});

test("executor failure is recoverable and releases the lease", async () => {
  const active = harness({ throwError: true });
  const first = await active.plane.run(task());
  assert.equal(first.status, "failed_recoverable");
  assert.equal(first.blocker, "synthetic_executor_crash");
  assert.equal(first.modelRoute.model, "fake-model");

  const next = await active.plane.run(task({ idempotencyKey: "issue-148-attempt-2" }));
  assert.equal(next.status, "failed_recoverable");
  assert.equal(active.leases.audit.filter((event) => event.type === "lease_released").length, 2);
});

test("adapters are swappable and audit output is sanitized", async () => {
  let routed = 0;
  let recalled = 0;
  const active = harness({
    modelRouter: {
      async route() {
        routed += 1;
        return {
          provider: "replacement",
          model: "replacement-model",
          source: "omniroute",
          rationale: "fake-adapter",
        };
      },
    },
    memory: {
      async loadContext() {
        recalled += 1;
        return ["context-from-fake-cognee"];
      },
    },
    result: {
      status: "completed",
      handoff: "Bearer secret-value contact person@example.com",
      externalEffects: [],
    },
  });
  const run = await active.plane.run(task());
  assert.equal(run.status, "completed");
  assert.equal(run.modelRoute.source, "omniroute");
  assert.equal(routed, 1);
  assert.equal(recalled, 1);
  const encoded = JSON.stringify(active.plane.audit);
  assert.equal(encoded.includes("secret-value"), false);
  assert.equal(encoded.includes("person@example.com"), false);
});

test("pending third-party roles cannot be selected", async () => {
  const roles = new AgentRoleRegistry([
    {
      id: "third-party-role",
      name: "Unreviewed role",
      capabilities: ["unknown"],
      reviewStatus: "pending-review",
    },
  ]);
  const active = harness({ roles });
  const run = await active.plane.run(task({ roleId: "third-party-role" }));
  assert.equal(run.status, "blocked");
  assert.equal(run.blocker, "agent_role_pending_review");
  assert.equal(active.executions(), 0);
});
