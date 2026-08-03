export const QUOTE_MODES = [
  "direct_quote",
  "inspection_first",
  "second_opinion",
  "emergency",
  "manual_review",
  "direct_accessory_quote",
  "compatibility_check_required",
  "inspection_before_installation",
  "installation_only",
  "product_and_installation",
] as const;

export type QuoteMode = (typeof QUOTE_MODES)[number];

export const COMPATIBILITY_STATUSES = [
  "not_applicable",
  "unknown",
  "confirmed",
  "incompatible",
] as const;

export type CompatibilityStatus =
  (typeof COMPATIBILITY_STATUSES)[number];

export const COMMERCIAL_SCOPES = [
  "service_only",
  "product_only",
  "installation_only",
  "product_and_installation",
  "undetermined",
] as const;

export type CommercialScope = (typeof COMMERCIAL_SCOPES)[number];

export type QuoteIntelligenceInput = {
  availableData?: string[];
  availableEvidence?: string[];
  availableMeasurements?: string[];
  availableDocuments?: string[];
  compatibilityStatus?: CompatibilityStatus;
  commercialScope?: CommercialScope;
  evidenceRefs?: string[];
};

export type PersistedQuoteIntelligenceInput = {
  available_data: string[];
  available_evidence: string[];
  available_measurements: string[];
  available_documents: string[];
  compatibility_status?: CompatibilityStatus;
  commercial_scope?: CommercialScope;
  evidence_refs: string[];
};

export type QuoteIntelligenceAssessment = {
  assessmentId: string;
  quoteMode: QuoteMode;
  confidence: number;
  diagnosticConfidence: "unknown" | "low" | "medium" | "high" | "confirmed";
  comparisonReadiness: "not_ready" | "partially_ready" | "ready" | "blocked";
  riskLevel: "low" | "medium" | "high" | "critical";
  vehicleMovement:
    | "not_assessed"
    | "do_not_move"
    | "tow_recommended"
    | "movement_requires_human_review"
    | "inspection_location_required";
  recommendedSpecialty: string;
  requiredQuestions: string[];
  requiredEvidence: string[];
  requiredMeasurements: string[];
  requiredDocuments: string[];
  compatibilityStatus: CompatibilityStatus;
  commercialScope: CommercialScope;
  reason: string;
  nextAction: string;
  requiresHumanReview: true;
  ruleVersion: "quoteability-alpha-1";
  engineVersion: "quote-intelligence-1.0.0";
};
