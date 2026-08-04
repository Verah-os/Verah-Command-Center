export const QUOTE_QUALITY_CLASSIFICATIONS = [
  "insufficient",
  "weak",
  "usable_with_caveats",
  "comparison_ready",
  "technically_confirmed",
] as const;

export type QuoteQualityClassification =
  (typeof QUOTE_QUALITY_CLASSIFICATIONS)[number];

export const QUOTE_COMMERCIAL_SCOPES = [
  "product_only",
  "service_only",
  "installation_only",
  "product_and_installation",
] as const;

export type QuoteCommercialScope = (typeof QUOTE_COMMERCIAL_SCOPES)[number];

export type QuoteQualityScores = {
  scopeCompleteness: number;
  evidenceQuality: number;
  diagnosisQuality: number;
  partsDetailQuality: number;
  laborDetailQuality: number;
  warrantyQuality: number;
  priceBreakdownQuality: number;
};

export type QuoteQualityAssessmentInput = QuoteQualityScores & {
  revisionId: string;
  normalizedScopeKey: string;
  secondOpinionEligibility: boolean;
  classification: QuoteQualityClassification;
  missingFields?: string[];
  exclusions?: string[];
  caveats?: string[];
  idempotencyKey: string;
};

export type PublishedQuoteOption = {
  option_id: string;
  label: string;
  commercial_scope: QuoteCommercialScope;
  items: unknown[];
  totals: Record<string, number>;
  estimated_duration: string | null;
  warranty_text: string | null;
  valid_until: string | null;
  caveats: string[];
  differences: Record<string, unknown>;
};

export type PublishedQuoteComparison = {
  comparison_set_id: string;
  service_request_id: string;
  status: "published";
  scope: QuoteCommercialScope;
  ranking_basis: string;
  published_at: string;
  proposals: PublishedQuoteOption[];
};
