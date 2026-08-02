import assert from "node:assert/strict";
import test from "node:test";

import { generateDeterministicAssessment } from "../services/intelligent-intake/assessment.ts";
import { createIntakeLog } from "../services/intelligent-intake/observability.ts";
import { transitionIntake } from "../services/intelligent-intake/state-machine.ts";

function context(overrides = {}) {
  return {
    alreadyProcessed: false,
    messageId: "00000000-0000-4000-8000-000000000001",
    messageType: "text",
    messageBody: "Olá",
    conversationId: "00000000-0000-4000-8000-000000000002",
    customerId: "00000000-0000-4000-8000-000000000003",
    customerDisplayName: "Cliente WhatsApp",
    sessionId: "00000000-0000-4000-8000-000000000004",
    correlationId: "00000000-0000-4000-8000-000000000005",
    status: "started",
    currentStep: "welcome",
    collectedData: {},
    vehicleId: null,
    vehicles: [],
    attachments: [],
    resumed: false,
    serviceRequestId: null,
    ...overrides,
  };
}

test("known customer starts deterministic vehicle collection", () => {
  const result = transitionIntake(context({ customerDisplayName: "Maria", vehicles: [] }));
  assert.equal(result.nextStep, "vehicle_brand");
  assert.equal(result.collectedData.customerName, "Maria");
  assert.match(result.response, /marca/i);
});

test("known vehicle is selected by stable list position", () => {
  const result = transitionIntake(context({
    status: "collecting_vehicle",
    currentStep: "vehicle_choice",
    messageBody: "1",
    vehicles: [{ id: "vehicle-1", brand: "Honda", model: "Fit", year: 2018, plate: "ABC1D23" }],
  }));
  assert.equal(result.vehicleId, "vehicle-1");
  assert.equal(result.nextStep, "mileage");
  assert.equal(result.collectedData.vehicle.model, "Fit");
});

test("invalid answer keeps the current state and does not invent data", () => {
  const result = transitionIntake(context({
    status: "collecting_mileage",
    currentStep: "mileage",
    messageBody: "não sei",
    collectedData: { customerName: "Maria" },
  }));
  assert.equal(result.valid, false);
  assert.equal(result.nextStep, "mileage");
  assert.deepEqual(result.collectedData, { customerName: "Maria" });
});

test("resumed intake makes resumption explicit", () => {
  const result = transitionIntake(context({
    status: "collecting_symptoms",
    currentStep: "symptom",
    messageBody: "O motor está falhando",
    resumed: true,
  }));
  assert.match(result.response, /retomar/i);
  assert.equal(result.nextStep, "conditions");
});

test("cancellation ends collection without creating a request", () => {
  const result = transitionIntake(context({ messageBody: "cancelar" }));
  assert.equal(result.nextStatus, "cancelled");
  assert.equal(result.complete, false);
});

test("confirmation marks a complete intake for transactional persistence", () => {
  const result = transitionIntake(context({
    status: "waiting_customer",
    currentStep: "confirmation",
    messageBody: "sim",
    collectedData: { customerName: "Maria", symptom: "Motor falha ao acelerar" },
  }));
  assert.equal(result.nextStatus, "ready");
  assert.equal(result.complete, true);
});

test("deterministic assessment labels hypotheses and escalates real risk terms", () => {
  const assessment = generateDeterministicAssessment({
    customerName: "Maria",
    vehicle: { brand: "Honda", model: "Fit", year: 2018 },
    mileage: 85000,
    symptom: "Cheiro de combustível e fumaça",
    conditions: "Ao ligar",
    frequency: "Sempre",
    dashboardLights: "Luz vermelha",
    operatingCondition: "Veículo parado",
    urgency: "alta",
  });
  assert.equal(assessment.engineType, "deterministic");
  assert.equal(assessment.requiresHumanReview, true);
  assert.equal(assessment.riskLevel, "critical");
  assert.ok(assessment.hypotheses.every((item) => /Hipótese para verificação/i.test(item.label)));
  assert.doesNotMatch(assessment.summary, /diagnóstico confirmado/i);
});

test("sanitized observability emits identifiers and state only", () => {
  const output = createIntakeLog({
    correlationId: "corr-1",
    conversationId: "conversation-1",
    messageId: "message-1",
    intakeSessionId: "session-1",
    customerId: "customer-1",
    vehicleId: null,
    serviceRequestId: null,
    event: "transition_applied",
  });
  const serialized = JSON.stringify(output);
  assert.doesNotMatch(serialized, /telefone|phone|body|token|secret/i);
  assert.equal(output.correlationId, "corr-1");
});
