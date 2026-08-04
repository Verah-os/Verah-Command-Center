import assert from "node:assert/strict";
import test from "node:test";

import {
  buildQuoteComparisonInput,
  buildQuoteQualityAssessmentInput,
} from "../services/quote-quality/input.ts";
import { createQuoteQualityLog } from "../services/quote-quality/observability.ts";

const revisionId = "a1111111-1111-4111-8111-111111111111";
const secondRevisionId = "a2222222-2222-4222-8222-222222222222";
const requestId = "a3333333-3333-4333-8333-333333333333";

test("quality assessment input is normalized and bounded", () => {
  const input = buildQuoteQualityAssessmentInput({
    revisionId: revisionId.toUpperCase(),
    normalizedScopeKey: "maintenance.preventive.v1",
    scopeCompleteness: 90,
    evidenceQuality: 80,
    diagnosisQuality: 70,
    partsDetailQuality: 85,
    laborDetailQuality: 95,
    warrantyQuality: 75,
    priceBreakdownQuality: 100,
    secondOpinionEligibility: false,
    classification: "usable_with_caveats",
    caveats: ["Prazo sujeito à disponibilidade", "Prazo sujeito à disponibilidade"],
    idempotencyKey: " assessment-1 ",
  });

  assert.equal(input.p_revision_id, revisionId);
  assert.deepEqual(input.p_caveats, ["Prazo sujeito à disponibilidade"]);
  assert.equal(input.p_idempotency_key, "assessment-1");
});

test("quality assessment rejects invalid scores and sensitive text", () => {
  const base = {
    revisionId,
    normalizedScopeKey: "maintenance.preventive.v1",
    scopeCompleteness: 90,
    evidenceQuality: 80,
    diagnosisQuality: 70,
    partsDetailQuality: 85,
    laborDetailQuality: 95,
    warrantyQuality: 75,
    priceBreakdownQuality: 100,
    secondOpinionEligibility: false,
    classification: "weak",
    idempotencyKey: "assessment-2",
  };
  assert.throws(
    () => buildQuoteQualityAssessmentInput({ ...base, warrantyQuality: 101 }),
    /invalid_score/,
  );
  assert.throws(
    () =>
      buildQuoteQualityAssessmentInput({
        ...base,
        caveats: ["Contato 5511999999999"],
      }),
    /sensitive_input/,
  );
});

test("comparison preserves human ordering and rejects price-only ranking", () => {
  const comparison = buildQuoteComparisonInput({
    serviceRequestId: requestId,
    revisionIds: [revisionId, secondRevisionId, revisionId],
    rankingBasis: "qualidade, garantia, escopo e preço",
    idempotencyKey: "comparison-1",
  });
  assert.deepEqual(comparison.p_revision_ids, [revisionId, secondRevisionId]);

  assert.throws(
    () =>
      buildQuoteComparisonInput({
        serviceRequestId: requestId,
        revisionIds: [revisionId, secondRevisionId],
        rankingBasis: "lowest_price",
        idempotencyKey: "comparison-2",
      }),
    /invalid_ranking_basis/,
  );
});

test("observability excludes payload, customer and provider identity", () => {
  const log = createQuoteQualityLog({
    event: "assessment_created",
    serviceRequestId: requestId,
    artifactId: revisionId,
    classification: "comparison_ready",
    memberCount: 2,
  });
  const serialized = JSON.stringify(log);
  assert.equal(log.domain, "quote_quality");
  assert.doesNotMatch(
    serialized,
    /phone|telefone|customer_name|provider_id|trade_name|payload|token|secret|authorization/i,
  );
});
