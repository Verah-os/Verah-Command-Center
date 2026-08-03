import type { QuoteQualityClassification } from "./types.ts";

export function createQuoteQualityLog(input: {
  event: "revision_created" | "assessment_created" | "comparison_published";
  serviceRequestId: string;
  artifactId: string;
  classification?: QuoteQualityClassification;
  memberCount?: number;
}) {
  return {
    domain: "quote_quality",
    event: input.event,
    serviceRequestId: input.serviceRequestId,
    artifactId: input.artifactId,
    ...(input.classification ? { classification: input.classification } : {}),
    ...(input.memberCount === undefined
      ? {}
      : { memberCount: input.memberCount }),
  };
}
