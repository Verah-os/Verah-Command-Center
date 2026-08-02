import "server-only";

import { createSupabaseAdminClient } from "@/services/supabase/admin";
import { buildQuoteIntelligenceInput } from "./input";
import type {
  QuoteIntelligenceAssessment,
  QuoteIntelligenceInput,
} from "./types";

type QuoteIntelligenceRow = {
  assessment_id: string;
  quote_mode: QuoteIntelligenceAssessment["quoteMode"];
  confidence: number | string;
  diagnostic_confidence: QuoteIntelligenceAssessment["diagnosticConfidence"];
  comparison_readiness: QuoteIntelligenceAssessment["comparisonReadiness"];
  risk_level: QuoteIntelligenceAssessment["riskLevel"];
  vehicle_movement: QuoteIntelligenceAssessment["vehicleMovement"];
  recommended_specialty: string;
  required_questions: string[];
  required_evidence: string[];
  required_measurements: string[];
  required_documents: string[];
  compatibility_status: QuoteIntelligenceAssessment["compatibilityStatus"];
  commercial_scope: QuoteIntelligenceAssessment["commercialScope"];
  reason: string;
  next_action: string;
  requires_human_review: true;
  rule_version: "quoteability-alpha-1";
  engine_version: "quote-intelligence-1.0.0";
};

export async function classifyQuoteIntelligence(input: {
  serviceRequestId: string;
  serviceCode: string;
  facts?: QuoteIntelligenceInput;
  idempotencyKey?: string;
}): Promise<QuoteIntelligenceAssessment> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("classify_quote_intelligence", {
    p_service_request_id: input.serviceRequestId,
    p_service_code: input.serviceCode,
    p_input: buildQuoteIntelligenceInput(input.facts ?? {}),
    p_idempotency_key: input.idempotencyKey ?? null,
  });

  if (error) {
    throw new Error(`quote_intelligence_classification_failed:${error.code}`);
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | QuoteIntelligenceRow
    | null;
  if (!row) throw new Error("quote_intelligence_empty_result");

  return {
    assessmentId: row.assessment_id,
    quoteMode: row.quote_mode,
    confidence: Number(row.confidence),
    diagnosticConfidence: row.diagnostic_confidence,
    comparisonReadiness: row.comparison_readiness,
    riskLevel: row.risk_level,
    vehicleMovement: row.vehicle_movement,
    recommendedSpecialty: row.recommended_specialty,
    requiredQuestions: row.required_questions,
    requiredEvidence: row.required_evidence,
    requiredMeasurements: row.required_measurements,
    requiredDocuments: row.required_documents,
    compatibilityStatus: row.compatibility_status,
    commercialScope: row.commercial_scope,
    reason: row.reason,
    nextAction: row.next_action,
    requiresHumanReview: row.requires_human_review,
    ruleVersion: row.rule_version,
    engineVersion: row.engine_version,
  };
}

