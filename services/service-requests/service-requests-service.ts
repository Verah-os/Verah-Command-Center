import { env } from "@/lib/env";
import { createSupabaseServerClient } from "@/services/supabase/server";
import type { ServiceRequest } from "@/types/service-request";

const columns = "id,reference_code,customer_name,customer_phone,vehicle_brand,vehicle_model,vehicle_year,vehicle_plate,city,customer_report,perceived_urgency,service_stage,probable_category,copilot_summary,copilot_questions,copilot_risk_signals,copilot_recommended_next_step,copilot_customer_message,copilot_confidence,requires_human_review,created_at";

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
    copilotCustomerMessage: row.copilot_customer_message as string | null, copilotConfidence: row.copilot_confidence === null ? null : Number(row.copilot_confidence),
    requiresHumanReview: row.requires_human_review as boolean, createdAt: row.created_at as string
  };
}

export async function listCustomerServiceRequests() {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("service_requests").select(columns).order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function getCustomerServiceRequest(id: string) {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("service_requests").select(columns).eq("id", id).maybeSingle();
  if (error || !data) return null;
  return mapRow(data as Record<string, unknown>);
}
