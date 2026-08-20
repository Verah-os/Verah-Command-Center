import assert from "node:assert/strict";
import test from "node:test";

import {
  createSyntheticPilotDemoMessages,
  isSyntheticPilotDemoEnabled,
} from "../services/whatsapp/synthetic-demo.ts";
import { transitionIntake } from "../services/intelligent-intake/state-machine.ts";

test("Pilot Alpha synthetic demo is allowed locally and in previews, never production", () => {
  assert.equal(
    isSyntheticPilotDemoEnabled({
      NODE_ENV: "development",
      VERAH_PILOT_ALPHA_SYNTHETIC_DEMO: "true",
    }),
    true,
  );
  assert.equal(
    isSyntheticPilotDemoEnabled({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      VERAH_PILOT_ALPHA_SYNTHETIC_DEMO: "true",
    }),
    true,
  );
  assert.equal(
    isSyntheticPilotDemoEnabled({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      VERAH_PILOT_ALPHA_SYNTHETIC_DEMO: "true",
    }),
    false,
  );
});

test("Pilot Alpha builds one deterministic intake ending in one confirmation", () => {
  const messages = createSyntheticPilotDemoMessages("run-123");

  assert.equal(new Set(messages.map((message) => message.phone)).size, 1);
  assert.equal(
    new Set(messages.map((message) => message.externalMessageId)).size,
    messages.length,
  );
  assert.equal(messages.filter((message) => message.body === "sim").length, 1);
  assert.equal(messages.at(-1)?.body, "sim");
  assert.ok(messages.every((message) => message.messageType === "text"));

  let context = {
    alreadyProcessed: false,
    messageId: messages[0].externalMessageId,
    messageType: "text",
    messageBody: messages[0].body,
    conversationId: "conversation-demo",
    customerId: "customer-demo",
    customerDisplayName: "Cliente WhatsApp",
    sessionId: "session-demo",
    correlationId: "correlation-demo",
    status: "started",
    currentStep: "welcome",
    collectedData: {},
    vehicleId: null,
    vehicles: [],
    attachments: [],
    resumed: false,
    serviceRequestId: null,
  };
  let completed = 0;

  for (const message of messages) {
    const transition = transitionIntake({
      ...context,
      messageId: message.externalMessageId,
      messageBody: message.body,
    });
    if (transition.complete) completed += 1;
    context = {
      ...context,
      status: transition.nextStatus,
      currentStep: transition.nextStep,
      collectedData: transition.collectedData,
      customerDisplayName:
        transition.customerDisplayName ?? context.customerDisplayName,
      vehicleId: transition.vehicleId ?? context.vehicleId,
    };
  }

  assert.equal(completed, 1);
  assert.equal(context.status, "ready");
  assert.equal(context.currentStep, "completed");
});
