import type { QuoteMode } from "./types.ts";

export type QuoteIntelligenceLogInput = {
  assessmentId: string;
  serviceRequestId: string;
  serviceCode: string;
  quoteMode: QuoteMode;
  ruleVersion: string;
  engineVersion: string;
  event: "assessment_created" | "assessment_reused" | "assessment_failed";
  errorCode?: string;
};

export function createQuoteIntelligenceLog(input: QuoteIntelligenceLogInput) {
  return {
    domain: "quote_intelligence",
    assessmentId: input.assessmentId,
    serviceRequestId: input.serviceRequestId,
    serviceCode: input.serviceCode,
    quoteMode: input.quoteMode,
    ruleVersion: input.ruleVersion,
    engineVersion: input.engineVersion,
    event: input.event,
    ...(input.errorCode ? { errorCode: input.errorCode } : {}),
  } as const;
}

