import assert from "node:assert/strict";
import test from "node:test";

import {
  AgentRoleRegistry,
  GuardedControlPlane,
  InMemoryAgentLeaseStore,
} from "../services/control-plane/foundation.ts";
import { OpenHandsExecutor } from "../services/control-plane/openhands-executor.ts";

const request = (overrides = {}) => ({
  task: {
    issueKey: "Verah-os/Verah-Command-Center#149",
    idempotencyKey: "issue-149-attempt-1",
    title: "OpenHands fallback executor",
    roleId: "coding",
    kind: "isolated_code",
    effects: ["local_files", "repository_branch", "sandbox"],
  },
  role: {
    id: "coding",
    name: "Software Engineer",
    capabilities: ["backend"],
    reviewStatus: "internal-approved",
  },
  modelRoute: {
    provider: "fixture",
    model: "fixture-model",
    source: "internal",
    rationale: "ci",
  },
  context: ["AGENTS.md", "github:#149"],
  dryRun: true,
  ...overrides,
});

function transport(overrides = {}) {
  return {
    cancelled: [],
    async readiness(signal) {
      assert.equal(signal instanceof AbortSignal, true);
      if (overrides.readinessError) throw new Error(overrides.readinessError);
      return overrides.readiness ?? "ready";
    },
    async execute(input, signal) {
      assert.equal(input.integrationSafe, true);
      assert.equal(input.request.dryRun, true);
      if (overrides.execute) return overrides.execute(input, signal);
      return overrides.result ?? {
        status: "completed",
        handoff: "Draft PR ready",
        costMicrounits: 21,
        logs: [],
        externalEffects: [],
      };
    },
    async cancel(executionId) {
      this.cancelled.push(executionId);
    },
  };
}

test("readiness is normalized without exposing transport states", async () => {
  for (const [raw, expected] of [
    ["ready", "available"],
    ["busy", "busy"],
    ["offline", "unavailable"],
    ["rate_limited", "rate_limited"],
  ]) {
    const executor = new OpenHandsExecutor(transport({ readiness: raw }));
    assert.equal(await executor.availability(), expected);
  }
  assert.equal(
    await new OpenHandsExecutor(transport({ readinessError: "connection refused" })).availability(),
    "unavailable",
  );
  const uncooperative = transport();
  uncooperative.readiness = () => new Promise(() => undefined);
  assert.equal(
    await new OpenHandsExecutor(uncooperative, { healthTimeoutMs: 5 }).availability(),
    "unavailable",
  );
});

test("integration-safe execution captures sanitized handoff, logs, duration and cost", async () => {
  const audit = [];
  const clock = [1_000, 1_037];
  const executor = new OpenHandsExecutor(
    transport({
      result: {
        status: "completed",
        handoff: "PR draft; contact person@example.com",
        costMicrounits: 55,
        logs: ["Authorization: Bearer secret-value"],
        externalEffects: [],
      },
    }),
    { now: () => clock.shift(), logger: (event) => audit.push(event) },
  );
  const result = await executor.execute(request());
  assert.equal(result.status, "completed");
  assert.equal(result.durationMs, 37);
  assert.equal(result.costMicrounits, 55);
  assert.match(result.handoff, /\[redacted-email\]/);
  const encoded = JSON.stringify(audit);
  assert.equal(encoded.includes("secret-value"), false);
  assert.equal(encoded.includes("person@example.com"), false);
});

test("timeout cancels the transport and returns a recoverable result", async () => {
  const fake = transport({
    execute: (_input, signal) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }),
  });
  const executor = new OpenHandsExecutor(fake, { executionTimeoutMs: 5 });
  const result = await executor.execute(request());
  assert.equal(result.status, "failed");
  assert.equal(result.errorCode, "openhands_timeout");
  assert.deepEqual(fake.cancelled, ["issue-149-attempt-1"]);
});

test("timeout releases an uncooperative transport", async () => {
  const fake = transport({ execute: () => new Promise(() => undefined) });
  const executor = new OpenHandsExecutor(fake, { executionTimeoutMs: 5 });
  const result = await executor.execute(request());
  assert.equal(result.errorCode, "openhands_timeout");
  assert.deepEqual(fake.cancelled, ["issue-149-attempt-1"]);
});

test("manual cancellation aborts only the selected execution", async () => {
  const started = Promise.withResolvers();
  const fake = transport({
    execute: (_input, signal) => new Promise((_resolve, reject) => {
      started.resolve();
      signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }),
  });
  const executor = new OpenHandsExecutor(fake, { executionTimeoutMs: 1_000 });
  const running = executor.execute(request());
  await started.promise;
  await executor.cancel("issue-149-attempt-1");
  const result = await running;
  assert.equal(result.errorCode, "openhands_cancelled");
  assert.deepEqual(fake.cancelled, ["issue-149-attempt-1"]);
});

test("Control Plane selects OpenHands explicitly and releases lease after failure", async () => {
  const fake = transport({
    result: {
      status: "failed",
      errorCode: "fixture_check_failed",
      logs: [],
      externalEffects: [],
    },
  });
  const executor = new OpenHandsExecutor(fake);
  const leases = new InMemoryAgentLeaseStore();
  const plane = new GuardedControlPlane(
    new AgentRoleRegistry(),
    leases,
    { async route() { return request().modelRoute; } },
    { async loadContext() { return ["AGENTS.md", "github:#149"]; } },
    executor,
    { enabled: true, killSwitch: false, dryRun: true },
  );
  const run = await plane.run(request().task);
  assert.equal(run.executorId, "openhands");
  assert.equal(run.status, "failed_recoverable");
  assert.equal(run.attempt, 1);
  assert.equal(run.blocker, "fixture_check_failed");
  assert.equal(typeof run.executorDurationMs, "number");
  assert.deepEqual(run.externalEffects, []);
  assert.equal(leases.audit.at(-1).type, "lease_released");

  const busyLeases = new InMemoryAgentLeaseStore();
  const busyPlane = new GuardedControlPlane(
    new AgentRoleRegistry(),
    busyLeases,
    { async route() { return request().modelRoute; } },
    { async loadContext() { return []; } },
    new OpenHandsExecutor(transport({ readiness: "busy" })),
    { enabled: true, killSwitch: false, dryRun: true },
  );
  const blocked = await busyPlane.run(request({
    task: { ...request().task, idempotencyKey: "issue-149-busy" },
  }).task);
  assert.equal(blocked.blocker, "executor_busy");
  assert.equal(busyLeases.audit.at(-1).type, "lease_released");
});

test("reported external effects fail closed", async () => {
  const executor = new OpenHandsExecutor(transport({
    result: {
      status: "completed",
      handoff: "unsafe",
      logs: [],
      externalEffects: ["real_message"],
    },
  }));
  const result = await executor.execute(request());
  assert.equal(result.status, "failed");
  assert.equal(result.errorCode, "openhands_side_effect_contract_violation");
  assert.deepEqual(result.externalEffects, ["real_message"]);
});
