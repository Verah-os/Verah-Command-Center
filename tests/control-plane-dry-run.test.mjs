import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { readControlPlaneConfig } from "../services/control-plane/config.ts";
import {
  parseSyntheticIssueEvent,
  processSyntheticIssue,
} from "../services/control-plane/intake.ts";
import { sanitizePayload } from "../services/control-plane/sanitization.ts";
import {
  assertTransition,
  canTransition,
  isDryRunTransition,
} from "../services/control-plane/state-machine.ts";
import { createControlPlaneSignature } from "../services/control-plane/signature.ts";
import { handleControlPlaneDryRunWebhook } from "../services/control-plane/webhook-handler.ts";

const fixture = async () =>
  JSON.parse(
    await readFile(
      new URL("./fixtures/control-plane/approved-issue.json", import.meta.url),
      "utf8",
    ),
  );

const config = (overrides = {}) => ({
  enabled: true,
  killSwitch: false,
  webhookSecret: "synthetic-control-plane-secret-32-chars",
  maintainers: new Set(["verah-maintainer"]),
  budget: {
    maxDurationMs: 30_000,
    maxSteps: 20,
    maxCostMicrounits: 10_000,
  },
  ...overrides,
});

class MemoryPersistence {
  workItems = new Map();
  deliveries = new Map();
  runs = new Map();
  lock = null;
  now = Date.parse("2026-07-31T20:02:00.000Z");
  externalEffects = [];

  async process(command) {
    if (this.deliveries.has(command.deliveryId)) {
      return { ...this.deliveries.get(command.deliveryId), status: "duplicate" };
    }
    const key = `${command.repository}#${command.issueNumber}`;
    let workItem = this.workItems.get(key);
    if (
      workItem &&
      Date.parse(command.issueUpdatedAt) < Date.parse(workItem.issueUpdatedAt)
    ) {
      const report = this.report("ignored_out_of_order", workItem, null, command);
      this.deliveries.set(command.deliveryId, report);
      return report;
    }
    if (!workItem) {
      workItem = {
        id: `work-${this.workItems.size + 1}`,
        issueUpdatedAt: command.issueUpdatedAt,
        state: "queued",
      };
      this.workItems.set(key, workItem);
    } else {
      workItem.issueUpdatedAt = command.issueUpdatedAt;
    }
    if (!command.approved) {
      workItem.state = "waiting_approval";
      const report = this.report("waiting_approval", workItem, null, command);
      this.deliveries.set(command.deliveryId, report);
      return report;
    }
    if (this.lock && this.lock.expiresAt > this.now && this.lock.key !== key) {
      workItem.state = "blocked";
      const report = this.report("blocked", workItem, null, command);
      this.deliveries.set(command.deliveryId, report);
      return report;
    }
    if (this.lock?.expiresAt <= this.now) this.lock = null;
    let run = this.runs.get(key);
    const resumed = Boolean(run?.active);
    if (!run || !run.active) {
      run = { id: `run-${this.runs.size + 1}`, active: true, resumeCount: 0 };
      this.runs.set(key, run);
    } else {
      run.resumeCount += 1;
    }
    this.lock = { key, expiresAt: this.now + 60_000 };
    const exceeded =
      command.budget.estimatedSteps > command.budget.maxSteps ||
      command.budget.estimatedCostMicrounits > command.budget.maxCostMicrounits;
    workItem.state = exceeded ? "blocked" : "completed";
    run.active = false;
    this.lock = null;
    const report = this.report(
      exceeded ? "blocked" : "completed",
      workItem,
      run,
      command,
      resumed,
    );
    this.deliveries.set(command.deliveryId, report);
    return report;
  }

  report(status, workItem, run, command, resumed = false) {
    return {
      status,
      workItemId: workItem.id,
      executionRunId: run?.id ?? null,
      state: workItem.state,
      resumed,
      plan: command.plan,
      budget: command.budget,
      repositoryMutations: [],
      productionMutations: [],
      externalEffects: [],
    };
  }
}

async function signedRequest(payload, activeConfig = config()) {
  const body = new TextEncoder().encode(JSON.stringify(payload));
  return new Request("https://example.test/api/control-plane/dry-run", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-verah-signature-256": createControlPlaneSignature(
        body,
        activeConfig.webhookSecret,
      ),
    },
    body,
  });
}

test("duplicate webhook creates one work item and one run without effects", async () => {
  const payload = await fixture();
  const persistence = new MemoryPersistence();
  const first = await processSyntheticIssue(
    parseSyntheticIssueEvent(payload),
    config(),
    persistence,
  );
  const second = await processSyntheticIssue(
    parseSyntheticIssueEvent(payload),
    config(),
    persistence,
  );

  assert.equal(first.status, "completed");
  assert.equal(second.status, "duplicate");
  assert.equal(first.workItemId, second.workItemId);
  assert.equal(first.executionRunId, second.executionRunId);
  assert.equal(persistence.workItems.size, 1);
  assert.equal(persistence.runs.size, 1);
  assert.deepEqual(first.externalEffects, []);
  assert.deepEqual(first.repositoryMutations, []);
  assert.deepEqual(first.productionMutations, []);
  assert.deepEqual(persistence.externalEffects, []);
});

test("out-of-order webhook is retained as ignored and does not create another run", async () => {
  const payload = await fixture();
  const persistence = new MemoryPersistence();
  await processSyntheticIssue(parseSyntheticIssueEvent(payload), config(), persistence);
  const stale = structuredClone(payload);
  stale.eventId = "synthetic.issue.67.delivery.stale";
  stale.issue.updatedAt = "2026-07-30T20:00:00.000Z";
  const report = await processSyntheticIssue(
    parseSyntheticIssueEvent(stale),
    config(),
    persistence,
  );
  assert.equal(report.status, "ignored_out_of_order");
  assert.equal(persistence.runs.size, 1);
});

test("issue without approval waits and invalid maintainer is rejected", async () => {
  const payload = await fixture();
  const persistence = new MemoryPersistence();
  delete payload.approval;
  const waiting = await processSyntheticIssue(
    parseSyntheticIssueEvent(payload),
    config(),
    persistence,
  );
  assert.equal(waiting.status, "waiting_approval");
  assert.equal(persistence.runs.size, 0);

  payload.eventId = "synthetic.issue.67.invalid-maintainer";
  payload.approval = {
    decision: "approved",
    maintainer: "unknown-user",
    decidedAt: "2026-07-31T20:03:00.000Z",
  };
  await assert.rejects(
    processSyntheticIssue(parseSyntheticIssueEvent(payload), config(), persistence),
    /maintainer_not_authorized/,
  );
});

test("occupied lock blocks a second issue and expired lock is reclaimed", async () => {
  const payload = await fixture();
  const persistence = new MemoryPersistence();
  persistence.lock = { key: "other/repo#1", expiresAt: persistence.now + 10_000 };
  const blocked = await processSyntheticIssue(
    parseSyntheticIssueEvent(payload),
    config(),
    persistence,
  );
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.executionRunId, null);

  const retry = structuredClone(payload);
  retry.eventId = "synthetic.issue.67.delivery.retry";
  persistence.lock.expiresAt = persistence.now - 1;
  const completed = await processSyntheticIssue(
    parseSyntheticIssueEvent(retry),
    config(),
    persistence,
  );
  assert.equal(completed.status, "completed");
});

test("kill switch and budget fail closed", async () => {
  const payload = await fixture();
  const persistence = new MemoryPersistence();
  await assert.rejects(
    processSyntheticIssue(
      parseSyntheticIssueEvent(payload),
      config({ killSwitch: true }),
      persistence,
    ),
    /kill_switch_active/,
  );
  assert.equal(persistence.workItems.size, 0);

  const report = await processSyntheticIssue(
    parseSyntheticIssueEvent(payload),
    config({ budget: { maxDurationMs: 1_000, maxSteps: 1, maxCostMicrounits: 1 } }),
    persistence,
  );
  assert.equal(report.status, "blocked");
  assert.deepEqual(report.externalEffects, []);
});

test("state machine rejects invalid and future mutable dry-run transitions", () => {
  assert.equal(canTransition("queued", "planning"), true);
  assert.equal(isDryRunTransition("queued", "implementing"), false);
  assert.throws(() => assertTransition("completed", "planning"), /invalid_control_plane_transition/);
});

test("simulated interruption resumes the same run", async () => {
  const payload = await fixture();
  const persistence = new MemoryPersistence();
  const key = `${payload.repository}#${payload.issue.number}`;
  persistence.workItems.set(key, {
    id: "work-interrupted",
    issueUpdatedAt: payload.issue.updatedAt,
    state: "planning",
  });
  persistence.runs.set(key, {
    id: "run-interrupted",
    active: true,
    resumeCount: 0,
  });
  persistence.lock = { key, expiresAt: persistence.now - 1 };
  const report = await processSyntheticIssue(
    parseSyntheticIssueEvent(payload),
    config(),
    persistence,
  );
  assert.equal(report.resumed, true);
  assert.equal(report.executionRunId, "run-interrupted");
  assert.equal(persistence.runs.get(key).resumeCount, 1);
});

test("payload sanitization removes secrets, contact data and sensitive keys", () => {
  const syntheticToken = ["ghp", "synthetic"].join("_") + "x".repeat(40);
  const sanitized = sanitizePayload({
    authorization: "Bearer private-value",
    note: "send to person@example.com or +5511999990001",
    nested: { token: syntheticToken },
  });
  const encoded = JSON.stringify(sanitized);
  assert.equal(encoded.includes("private-value"), false);
  assert.equal(encoded.includes("person@example.com"), false);
  assert.equal(encoded.includes("+5511999990001"), false);
  assert.equal(encoded.includes(syntheticToken), false);
});

test("webhook validates signature and never enables synthetic mode in production", async () => {
  const payload = await fixture();
  const persistence = new MemoryPersistence();
  const activeConfig = config();
  const accepted = await handleControlPlaneDryRunWebhook(
    await signedRequest(payload, activeConfig),
    { config: activeConfig, persistence },
  );
  assert.equal(accepted.status, 202);

  const invalid = await handleControlPlaneDryRunWebhook(
    new Request("https://example.test/api/control-plane/dry-run", {
      method: "POST",
      headers: { "x-verah-signature-256": "sha256=invalid" },
      body: JSON.stringify(payload),
    }),
    { config: activeConfig, persistence },
  );
  assert.equal(invalid.status, 401);

  const production = readControlPlaneConfig({
    NODE_ENV: "production",
    CONTROL_PLANE_DRY_RUN_ENABLED: "true",
    CONTROL_PLANE_KILL_SWITCH: "false",
    CONTROL_PLANE_DRY_RUN_WEBHOOK_SECRET: activeConfig.webhookSecret,
    CONTROL_PLANE_MAINTAINERS: "verah-maintainer",
  });
  assert.equal(production.enabled, false);
});
