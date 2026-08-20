import assert from "node:assert/strict";
import test from "node:test";

import { dispatchN8nEvent, N8nDeliveryError } from "../services/n8n/client.ts";
import { canDispatchN8n, readN8nConfig } from "../services/n8n/config.ts";
import { parseN8nContract } from "../services/n8n/contract.ts";
import { runN8nWorker } from "../services/n8n/worker.ts";
import { handleN8nWorkerRequest } from "../services/n8n/worker-handler.ts";

const workerSecret = "synthetic-n8n-worker-secret-32-characters";
const authToken = "synthetic-n8n-webhook-token-32-characters";

test("versioned contracts accept safe SLA data and reject unsafe or unknown input", () => {
  assert.equal(parseN8nContract(contract()).schema_version, 1);
  assert.throws(
    () => parseN8nContract({ ...contract(), schema_version: 2 }),
    /n8n_contract_version_unsupported/,
  );
  assert.throws(
    () => parseN8nContract({ ...contract(), data: { phone: "+5511999999999" } }),
    /n8n_contract_unsafe_data/,
  );
});

test("delivery forwards the version and idempotency key without trusting response data", async () => {
  let request;
  await dispatchN8nEvent(contract(), "n8n:sla:intake:1:v1", config(), async (url, init) => {
    request = { url, init };
    return Response.json({ canonical_status: "must_be_ignored" });
  });
  assert.equal(request.url, "https://n8n.example.test/webhook/verah");
  assert.equal(request.init.headers["Idempotency-Key"], "n8n:sla:intake:1:v1");
  assert.equal(request.init.headers["X-Verah-Contract-Version"], "1");
  assert.match(request.init.headers.Authorization, /^Bearer /);
});

test("transport errors classify retryable and terminal responses", async () => {
  await assert.rejects(
    dispatchN8nEvent(contract(), "key", config(), async () => new Response(null, { status: 503 })),
    (error) => error instanceof N8nDeliveryError && error.code === "n8n_http_503" && error.retryable,
  );
  await assert.rejects(
    dispatchN8nEvent(contract(), "key", config(), async () => new Response(null, { status: 400 })),
    (error) => error instanceof N8nDeliveryError && error.code === "n8n_http_400" && !error.retryable,
  );
});

test("worker preserves retry and dead-letter while logs remain sanitized", async () => {
  const logs = [];
  const failures = [];
  const result = await runN8nWorker({
    async enqueueSla() { return 2; },
    async claim() {
      return [
        { outboxId: "outbox-retry", idempotencyKey: "safe-retry", payload: contract(), attemptCount: 1 },
        { outboxId: "outbox-dead", idempotencyKey: "safe-dead", payload: contract(), attemptCount: 5 },
      ];
    },
    async deliver(item) {
      if (item.outboxId === "outbox-retry") throw new N8nDeliveryError("n8n_http_503", true);
      throw new N8nDeliveryError("n8n_http_400", false);
    },
    async complete() {},
    async fail(id, code, retryable) {
      failures.push({ id, code, retryable });
      return retryable ? "failed" : "dead_letter";
    },
    async report() { return { pending: 1, dead_letter: 1 }; },
    log(event) { logs.push(event); },
  });
  assert.deepEqual(result, {
    enqueued: 2,
    claimed: 2,
    sent: 0,
    retrying: 1,
    deadLetter: 1,
    report: { pending: 1, dead_letter: 1 },
  });
  assert.deepEqual(failures, [
    { id: "outbox-retry", code: "n8n_http_503", retryable: true },
    { id: "outbox-dead", code: "n8n_http_400", retryable: false },
  ]);
  const serialized = JSON.stringify(logs);
  assert.doesNotMatch(serialized, /Bearer|5511|webhook-token|stalled_since/i);
  assert.match(serialized, /n8n_http_503/);
});

test("kill switch and missing transport are authenticated no-ops", async () => {
  let runs = 0;
  const request = new Request("https://example.test/n8n-worker", {
    method: "POST",
    headers: { authorization: `Bearer ${workerSecret}` },
  });
  const disabled = await handleN8nWorkerRequest(request, {
    secret: workerSecret,
    enabled: false,
    available: true,
    async run() { runs += 1; },
  });
  assert.deepEqual(await disabled.json(), { status: "disabled" });

  const unavailable = await handleN8nWorkerRequest(request, {
    secret: workerSecret,
    enabled: true,
    available: false,
    async run() { runs += 1; },
  });
  assert.deepEqual(await unavailable.json(), { status: "transport_unavailable" });
  assert.equal(runs, 0);
});

test("configuration is disabled by default and requires HTTPS plus server secrets", () => {
  const disabled = readN8nConfig({
    N8N_DISPATCHER_WEBHOOK_URL: "https://n8n.example.test/webhook/verah",
    N8N_WEBHOOK_AUTH_TOKEN: authToken,
    N8N_WORKER_SECRET: workerSecret,
  });
  assert.equal(disabled.enabled, false);
  assert.equal(canDispatchN8n(disabled), true);
  assert.equal(canDispatchN8n({ ...disabled, webhookUrl: "http://n8n.example.test" }), false);
});

function contract() {
  return {
    schema_version: 1,
    event_id: "78000000-0000-4000-8000-000000000001",
    event_type: "sla.intake.stalled",
    aggregate_type: "intake_session",
    aggregate_id: "78000000-0000-4000-8000-000000000002",
    occurred_at: "2026-08-20T03:00:00.000Z",
    data: { current_step: "symptom", stalled_since: "2026-08-20T02:30:00.000Z" },
  };
}

function config() {
  return {
    enabled: true,
    webhookUrl: "https://n8n.example.test/webhook/verah",
    webhookAuthToken: authToken,
    workerSecret,
    timeoutMs: 1_000,
  };
}
