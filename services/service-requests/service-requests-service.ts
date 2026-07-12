import { env } from "@/lib/env";
import { createSupabaseServerClient } from "@/services/supabase/server";
import type { ServiceRequest } from "@/types/service-request";

const columns = "id,reference_code,customer_name,customer_phone,vehicle_brand,vehicle_model,vehicle_year,vehicle_plate,city,customer_report,perceived_urgency,service_stage,probable_category,copilot_summary,copilot_questions,copilot_risk_signals,copilot_recommended_next_step,copilot_customer_message,copilot_concierge_brief,copilot_provider_brief,copilot_confidence,requires_human_review,created_at,created_by,concierge_id,concierge_accepted_at,work_order_id,provider_id,provider_assigned_at,provider_assigned_by";

function mapRow(row: Record<string, unknown>): ServiceRequest {
  return {
    id: row.id as string, referenceCode: row.reference_code as string, customerName: row.customer_name as string,
    customerPhone: row.customer_phone as string | null, vehicleBrand: row.vehicle_brand as string,
    vehicleModel: row.vehicle_model as string, vehicleYear: row.vehicle_year as number | null,
    vehiclePlate: row.vehicle_plate as string | null, city: row.city as string, customerReport: row.customer_report as string,
    perceivedUrgency: row.perceived_urgency as ServiceRequest["perceivedUrgency"], serviceStage: row.service_stage as ServiceRequest["serviceStage"],
    probableCategory: row.probable_category as ServiceRequest["probableCategory"], copilotSummary: row.copilot_summary as string | null,
    copilotQuestions: (row.copilot_questions as string[]) ?? [], copilotRiskSignals: (row.copilot_risk_signals as string[]) ?? [],
    copilotRecommendedNextStep: row.copilot_recommended_next_step as string | null,
    copilotCustomerMessage: row.copilot_customer_message as string | null,
    copilotConciergeBrief: row.copilot_concierge_brief as string | null, copilotProviderBrief: row.copilot_provider_brief as string | null,
    copilotConfidence: row.copilot_confidence === null ? null : Number(row.copilot_confidence),
    requiresHumanReview: row.requires_human_review as boolean, createdAt: row.created_at as string,
    conciergeId: row.concierge_id as string | null, conciergeAcceptedAt: row.concierge_accepted_at as string | null,
    workOrderId: row.work_order_id as string | null, providerId: row.provider_id as string | null,
    providerAssignedAt: row.provider_assigned_at as string | null, providerAssignedBy: row.provider_assigned_by as string | null
  };
}

export async function listProviderServiceRequests(providerId: string) {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("service_requests").select(columns).eq("provider_id", providerId).order("provider_assigned_at", { ascending: false });
  if (error) return [];
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function getProviderServiceRequest(id: string, providerId: string) {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("service_requests").select(columns).eq("id", id).eq("provider_id", providerId).maybeSingle();
  return error || !data ? null : mapRow(data as Record<string, unknown>);
}

export async function listCustomerServiceRequests() {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return [];
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase.from("service_requests").select(columns).eq("created_by", user.id).order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function listConciergeServiceRequests() {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("service_requests").select(columns).order("created_at", { ascending: false });
  if (error) return [];
  const urgencyOrder = { critica: 0, alta: 1, media: 2, baixa: 3 };
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>)).sort((a, b) =>
    urgencyOrder[a.perceivedUrgency] - urgencyOrder[b.perceivedUrgency] || Date.parse(b.createdAt) - Date.parse(a.createdAt)
  );
}

export async function getCustomerServiceRequest(id: string) {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from("service_requests").select(columns).eq("id", id).eq("created_by", user.id).maybeSingle();
  if (error || !data) return null;
  return mapRow(data as Record<string, unknown>);
}

export async function getConciergeServiceRequest(id: string) {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("service_requests").select(columns).eq("id", id).maybeSingle();
  if (error || !data) return null;
  return mapRow(data as Record<string, unknown>);
}

export async function getConciergeStats() {
  const requests = await listConciergeServiceRequests();
  return {
    requested: requests.filter((request) => request.serviceStage === "solicitado").length,
    inService: requests.filter((request) => request.serviceStage === "concierge_aceitou").length,
    critical: requests.filter((request) => request.perceivedUrgency === "critica").length,
    awaitingReview: requests.filter((request) => request.requiresHumanReview && request.serviceStage === "solicitado").length
  };
}
