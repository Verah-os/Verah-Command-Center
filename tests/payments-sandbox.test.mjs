import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCustomerPilotPaymentCommand,
  createLocalSandboxPaymentProvider,
  SandboxPaymentService,
} from "../services/payments-sandbox/index.ts";

const fixedNow = () => "2026-08-21T10:41:00.000Z";

test("canonical sandbox payment keeps 580 + 79 = 659", async () => {
  const service = paymentService();
  const operation = await service.process(buildCustomerPilotPaymentCommand({ approved: true }));
  assert.deepEqual(operation.amounts, {
    serviceAmount: 58_000,
    verahFee: 7_900,
    customerTotal: 65_900,
  });
  assert.equal(operation.status, "confirmed");
});

test("payment without explicit customer approval never reaches the provider", async () => {
  let calls = 0;
  const service = paymentService(countingProvider(() => { calls += 1; }));
  const operation = await service.process(buildCustomerPilotPaymentCommand({ approved: false }));
  assert.equal(operation.status, "requires_approval");
  assert.equal(calls, 0);
  assert.deepEqual(operation.ledger.map(({ code }) => code), ["intent_created", "approval_required"]);
});

test("concurrent retries with the same idempotency key create one provider operation", async () => {
  let calls = 0;
  const service = paymentService(countingProvider(() => { calls += 1; }));
  const command = buildCustomerPilotPaymentCommand({ approved: true, idempotencyKey: "same-retry" });
  const [first, replay] = await Promise.all([service.process(command), service.process(command)]);
  assert.equal(calls, 1);
  assert.deepEqual(first, replay);
  assert.equal(first.ledger.filter(({ code }) => code === "payment_confirmed").length, 1);
});

test("quote change invalidates the prior approval", async () => {
  let calls = 0;
  const service = paymentService(countingProvider(() => { calls += 1; }));
  const command = buildCustomerPilotPaymentCommand({ approved: true });
  command.quoteVersion = "2";
  const operation = await service.process(command);
  assert.equal(operation.status, "requires_approval");
  assert.equal(operation.failureReason, "quote_reapproval_required");
  assert.equal(calls, 0);
});

test("provider failure returns a safe auditable state", async () => {
  const service = paymentService(createLocalSandboxPaymentProvider({ failure: "provider_unavailable" }));
  const operation = await service.process(buildCustomerPilotPaymentCommand({ approved: true }));
  assert.equal(operation.status, "failed");
  assert.equal(operation.failureReason, "provider_unavailable");
  assert.equal(operation.providerReference, null);
  assert.equal(operation.ledger.at(-1)?.code, "payment_failed");
});

test("ledger records append-only transitions and safe refund", async () => {
  const service = paymentService();
  const confirmed = await service.process(buildCustomerPilotPaymentCommand({ approved: true }));
  assert.deepEqual(confirmed.ledger.map(({ sequence }) => sequence), [1, 2, 3]);
  const refunded = service.recordAdjustment({
    operationId: confirmed.id,
    idempotencyKey: "refund-demo-1",
    actor: "customer",
    type: "refund",
  });
  assert.equal(refunded.status, "refunded");
  assert.equal(refunded.ledger.at(-1)?.code, "refund_recorded");
  assert.deepEqual(
    service.recordAdjustment({ operationId: confirmed.id, idempotencyKey: "refund-demo-1", actor: "customer", type: "refund" }),
    refunded,
  );
});

test("PAN and CVV are rejected and tokens never enter operation or audit logs", async () => {
  const events = [];
  const service = new SandboxPaymentService({
    provider: createLocalSandboxPaymentProvider(),
    now: fixedNow,
    onEvent: (event) => events.push(event),
  });
  const command = buildCustomerPilotPaymentCommand({ approved: true });
  const operation = await service.process(command);
  const persisted = JSON.stringify({ operation, events });
  assert.doesNotMatch(persisted, /sandbox_pm_visa_4821|cvv|securityCode|4111111111111111/i);
  assert.throws(
    () => service.process({ ...command, idempotencyKey: "sensitive", cvv: "123" }),
    /payment_sensitive_data_rejected/,
  );
  assert.throws(
    () => service.process({ ...command, idempotencyKey: "pan", note: "4111111111111111" }),
    /payment_sensitive_data_rejected/,
  );
});

test("VERAH agent cannot authorize or move money", async () => {
  let calls = 0;
  const service = paymentService(countingProvider(() => { calls += 1; }));
  const operation = await service.process(buildCustomerPilotPaymentCommand({
    approved: true,
    actor: "verah_agent",
  }));
  assert.equal(operation.status, "blocked");
  assert.equal(operation.failureReason, "customer_authorization_required");
  assert.equal(calls, 0);
});

function paymentService(provider = createLocalSandboxPaymentProvider()) {
  return new SandboxPaymentService({ provider, now: fixedNow });
}

function countingProvider(onAuthorize) {
  const provider = createLocalSandboxPaymentProvider();
  return {
    ...provider,
    async authorize(input) {
      onAuthorize();
      return provider.authorize(input);
    },
  };
}
