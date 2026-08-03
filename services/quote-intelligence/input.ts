import {
  COMMERCIAL_SCOPES,
  COMPATIBILITY_STATUSES,
  type PersistedQuoteIntelligenceInput,
  type QuoteIntelligenceInput,
} from "./types.ts";

const tokenPattern = /^[a-z0-9_.:-]{1,120}$/;
const sensitiveNumericSequencePattern = /\d{7,}/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function buildQuoteIntelligenceInput(
  input: QuoteIntelligenceInput,
): PersistedQuoteIntelligenceInput {
  if (
    input.compatibilityStatus &&
    !COMPATIBILITY_STATUSES.includes(input.compatibilityStatus)
  ) {
    throw new Error("quote_intelligence_invalid_compatibility");
  }
  if (
    input.commercialScope &&
    !COMMERCIAL_SCOPES.includes(input.commercialScope)
  ) {
    throw new Error("quote_intelligence_invalid_commercial_scope");
  }

  return {
    available_data: normalizeTokens(input.availableData),
    available_evidence: normalizeTokens(input.availableEvidence),
    available_measurements: normalizeTokens(input.availableMeasurements),
    available_documents: normalizeTokens(input.availableDocuments),
    ...(input.compatibilityStatus
      ? { compatibility_status: input.compatibilityStatus }
      : {}),
    ...(input.commercialScope
      ? { commercial_scope: input.commercialScope }
      : {}),
    evidence_refs: normalizeEvidenceRefs(input.evidenceRefs),
  };
}

function normalizeTokens(values: string[] | undefined) {
  if (!values) return [];
  if (values.length > 100) {
    throw new Error("quote_intelligence_input_too_large");
  }
  const normalized = values.map((value) => value.trim().toLowerCase());
  if (
    normalized.some(
      (value) =>
        !tokenPattern.test(value) || sensitiveNumericSequencePattern.test(value),
    )
  ) {
    throw new Error("quote_intelligence_invalid_input_token");
  }
  return [...new Set(normalized)].sort();
}

function normalizeEvidenceRefs(values: string[] | undefined) {
  if (!values) return [];
  if (values.length > 100) {
    throw new Error("quote_intelligence_evidence_refs_too_large");
  }
  const normalized = values.map((value) => value.trim().toLowerCase());
  if (normalized.some((value) => !uuidPattern.test(value))) {
    throw new Error("quote_intelligence_invalid_evidence_ref");
  }
  return [...new Set(normalized)].sort();
}
