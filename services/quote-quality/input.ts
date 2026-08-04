import {
  QUOTE_QUALITY_CLASSIFICATIONS,
  type QuoteQualityAssessmentInput,
} from "./types.ts";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const scopeKeyPattern = /^[a-z0-9][a-z0-9._:-]{2,119}$/;
const sensitivePattern =
  /(?:\b\d{7,}\b|[\w.+-]+@[\w.-]+\.[a-z]{2,}|bearer\s+|service[_-]?role|authorization)/i;

export function buildQuoteQualityAssessmentInput(
  input: QuoteQualityAssessmentInput,
) {
  if (!uuidPattern.test(input.revisionId.toLowerCase())) {
    throw new Error("quote_quality_invalid_revision");
  }
  if (!scopeKeyPattern.test(input.normalizedScopeKey)) {
    throw new Error("quote_quality_invalid_scope_key");
  }
  if (!QUOTE_QUALITY_CLASSIFICATIONS.includes(input.classification)) {
    throw new Error("quote_quality_invalid_classification");
  }
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 200) {
    throw new Error("quote_quality_invalid_idempotency_key");
  }

  const scores = [
    input.scopeCompleteness,
    input.evidenceQuality,
    input.diagnosisQuality,
    input.partsDetailQuality,
    input.laborDetailQuality,
    input.warrantyQuality,
    input.priceBreakdownQuality,
  ];
  if (scores.some((score) => !Number.isInteger(score) || score < 0 || score > 100)) {
    throw new Error("quote_quality_invalid_score");
  }

  return {
    p_revision_id: input.revisionId.toLowerCase(),
    p_normalized_scope_key: input.normalizedScopeKey,
    p_scope_completeness: input.scopeCompleteness,
    p_evidence_quality: input.evidenceQuality,
    p_diagnosis_quality: input.diagnosisQuality,
    p_parts_detail_quality: input.partsDetailQuality,
    p_labor_detail_quality: input.laborDetailQuality,
    p_warranty_quality: input.warrantyQuality,
    p_price_breakdown_quality: input.priceBreakdownQuality,
    p_second_opinion_eligibility: input.secondOpinionEligibility,
    p_classification: input.classification,
    p_missing_fields: sanitizeList(input.missingFields),
    p_exclusions: sanitizeList(input.exclusions),
    p_caveats: sanitizeList(input.caveats),
    p_idempotency_key: input.idempotencyKey.trim(),
  };
}

export function buildQuoteComparisonInput(input: {
  serviceRequestId: string;
  revisionIds: string[];
  rankingBasis: string;
  idempotencyKey: string;
}) {
  const revisionIds = [...new Set(input.revisionIds.map((id) => id.toLowerCase()))];
  const rankingBasis = input.rankingBasis.trim();
  if (
    !uuidPattern.test(input.serviceRequestId.toLowerCase()) ||
    revisionIds.length < 2 ||
    revisionIds.length > 26 ||
    revisionIds.some((id) => !uuidPattern.test(id))
  ) {
    throw new Error("quote_comparison_invalid_revisions");
  }
  if (
    !rankingBasis ||
    ["lowest_price", "price_only", "menor_preco"].includes(
      rankingBasis.toLowerCase(),
    )
  ) {
    throw new Error("quote_comparison_invalid_ranking_basis");
  }
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 200) {
    throw new Error("quote_comparison_invalid_idempotency_key");
  }
  if (sensitivePattern.test(rankingBasis)) {
    throw new Error("quote_comparison_sensitive_input");
  }
  return {
    p_service_request_id: input.serviceRequestId.toLowerCase(),
    p_revision_ids: revisionIds,
    p_ranking_basis: rankingBasis,
    p_idempotency_key: input.idempotencyKey.trim(),
  };
}

function sanitizeList(values: string[] | undefined) {
  if (!values) return [];
  if (values.length > 50) throw new Error("quote_quality_input_too_large");
  const normalized = values.map((value) => value.trim()).filter(Boolean);
  if (
    normalized.some(
      (value) => value.length > 240 || sensitivePattern.test(value),
    )
  ) {
    throw new Error("quote_quality_sensitive_input");
  }
  return [...new Set(normalized)];
}
