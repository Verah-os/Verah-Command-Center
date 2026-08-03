import assert from "node:assert/strict";
import test from "node:test";

import { buildQuoteIntelligenceInput } from "../services/quote-intelligence/input.ts";
import { createQuoteIntelligenceLog } from "../services/quote-intelligence/observability.ts";

test("Quote Intelligence input is deterministic and removes duplicates", () => {
  const input = buildQuoteIntelligenceInput({
    availableData: [" Vehicle_Model ", "vehicle_brand", "vehicle_model"],
    availableEvidence: ["symptom_media"],
    compatibilityStatus: "confirmed",
    commercialScope: "product_and_installation",
    evidenceRefs: [
      "A1111111-1111-4111-8111-111111111111",
      "a1111111-1111-4111-8111-111111111111",
    ],
  });

  assert.deepEqual(input.available_data, ["vehicle_brand", "vehicle_model"]);
  assert.deepEqual(input.available_evidence, ["symptom_media"]);
  assert.deepEqual(input.evidence_refs, [
    "a1111111-1111-4111-8111-111111111111",
  ]);
  assert.equal(input.compatibility_status, "confirmed");
  assert.equal(input.commercial_scope, "product_and_installation");
});

test("Quote Intelligence input rejects payload-like free text", () => {
  assert.throws(
    () => buildQuoteIntelligenceInput({ availableData: ["telefone:+5511999999999"] }),
    /invalid_input_token/,
  );
  assert.throws(
    () => buildQuoteIntelligenceInput({ availableData: ["telefone:5511999999999"] }),
    /invalid_input_token/,
  );
  assert.throws(
    () => buildQuoteIntelligenceInput({ evidenceRefs: ["external-media-id"] }),
    /invalid_evidence_ref/,
  );
});

test("Quote Intelligence input rejects unbounded collections", () => {
  assert.throws(
    () =>
      buildQuoteIntelligenceInput({
        availableData: Array.from({ length: 101 }, (_, index) => `field_${index}`),
      }),
    /input_too_large/,
  );
});

test("Quote Intelligence observability contains identifiers and classification only", () => {
  const log = createQuoteIntelligenceLog({
    assessmentId: "assessment-1",
    serviceRequestId: "request-1",
    serviceCode: "accessory.tint",
    quoteMode: "direct_accessory_quote",
    ruleVersion: "quoteability-alpha-1",
    engineVersion: "quote-intelligence-1.0.0",
    event: "assessment_created",
  });
  const serialized = JSON.stringify(log);

  assert.equal(log.domain, "quote_intelligence");
  assert.doesNotMatch(
    serialized,
    /phone|telefone|customer_name|body|payload|token|secret|authorization/i,
  );
});
