import "server-only";

import { createSupabaseAdminClient } from "@/services/supabase/admin";
import { createSupabaseServerClient } from "@/services/supabase/server";
import {
  buildQuoteComparisonInput,
  buildQuoteQualityAssessmentInput,
} from "./input";
import type {
  PublishedQuoteComparison,
  QuoteQualityAssessmentInput,
} from "./types";

export async function createQuoteRevision(input: {
  quoteId: string;
  idempotencyKey?: string;
}) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("create_service_quote_revision", {
    p_quote_id: input.quoteId,
    p_idempotency_key: input.idempotencyKey ?? null,
  });
  if (error) throw new Error(`quote_revision_failed:${error.code}`);
  return data as string;
}

export async function assessQuoteRevision(input: QuoteQualityAssessmentInput) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc(
    "assess_quote_revision",
    buildQuoteQualityAssessmentInput(input),
  );
  if (error) throw new Error(`quote_quality_assessment_failed:${error.code}`);
  return data as string;
}

export async function createQuoteComparison(input: {
  serviceRequestId: string;
  revisionIds: string[];
  rankingBasis: string;
  idempotencyKey: string;
}) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc(
    "create_quote_comparison_set",
    buildQuoteComparisonInput(input),
  );
  if (error) throw new Error(`quote_comparison_failed:${error.code}`);
  return data as string;
}

export async function getPublishedQuoteComparison(comparisonSetId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_published_quote_comparison", {
    p_comparison_set_id: comparisonSetId,
  });
  if (error) throw new Error(`published_quote_comparison_failed:${error.code}`);
  return data as PublishedQuoteComparison;
}
