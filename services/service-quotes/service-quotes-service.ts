import { createSupabaseServerClient } from "@/services/supabase/server";
import type { QuoteItem, ServiceQuote } from "@/types/service-quote";

export type ServiceQuoteTiming = Pick<
  ServiceQuote,
  | "id"
  | "serviceRequestId"
  | "status"
  | "submittedAt"
  | "approvedAt"
  | "clarificationRequestedAt"
  | "customerDecisionNote"
>;

export async function getQuoteForRequest(
  requestId: string,
): Promise<ServiceQuote | null> {
  const supabase = await createSupabaseServerClient();
  const { data: quote } = await supabase
    .from("service_quotes")
    .select("*")
    .eq("service_request_id", requestId)
    .neq("status", "cancelled")
    .maybeSingle();
  if (!quote) return null;
  const { data: items } = await supabase
    .from("service_quote_items")
    .select("*")
    .eq("quote_id", quote.id)
    .order("created_at");
  return {
    id: quote.id,
    serviceRequestId: quote.service_request_id,
    providerId: quote.provider_id,
    status: quote.status,
    laborTotal: Number(quote.labor_total),
    partsTotal: Number(quote.parts_total),
    additionalTotal: Number(quote.additional_total),
    totalAmount: Number(quote.total_amount),
    estimatedDuration: quote.estimated_duration,
    technicalNotes: quote.technical_notes,
    customerSummary: quote.customer_summary,
    warrantyText: quote.warranty_text,
    validUntil: quote.valid_until,
    submittedAt: quote.submitted_at,
    approvedAt: quote.approved_at,
    clarificationRequestedAt: quote.clarification_requested_at,
    customerDecisionNote: quote.customer_decision_note,
    items: (items ?? []).map(
      (item): QuoteItem => ({
        id: item.id,
        itemType: item.item_type,
        description: item.description,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unit_price),
        totalPrice: Number(item.total_price),
        isOptional: item.is_optional,
      }),
    ),
  };
}

export async function listQuoteTimingsForRequests(requestIds: string[]) {
  const timings = new Map<string, ServiceQuoteTiming>();
  if (!requestIds.length) return timings;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("service_quotes")
    .select(
      "id,service_request_id,status,submitted_at,approved_at,clarification_requested_at,customer_decision_note,updated_at",
    )
    .in("service_request_id", requestIds)
    .neq("status", "cancelled")
    .order("updated_at", { ascending: false });
  if (error) return timings;
  for (const row of data ?? []) {
    if (timings.has(row.service_request_id)) continue;
    timings.set(row.service_request_id, {
      id: row.id,
      serviceRequestId: row.service_request_id,
      status: row.status,
      submittedAt: row.submitted_at,
      approvedAt: row.approved_at,
      clarificationRequestedAt: row.clarification_requested_at,
      customerDecisionNote: row.customer_decision_note,
    });
  }
  return timings;
}

export async function getQuoteStats() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("service_quotes")
    .select("status,total_amount");
  return {
    drafts: data?.filter((quote) => quote.status === "draft").length ?? 0,
    waiting: data?.filter((quote) => quote.status === "submitted").length ?? 0,
    approved: data?.filter((quote) => quote.status === "approved").length ?? 0,
    approvedTotal:
      data
        ?.filter((quote) => quote.status === "approved")
        .reduce((total, quote) => total + Number(quote.total_amount), 0) ?? 0,
  };
}
