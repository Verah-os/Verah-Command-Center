"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { analyzeServiceRequest, urgencyLevels, type ServiceCopilotInput, type ServiceUrgency } from "@/services/service-copilot";
import { createSupabaseServerClient } from "@/services/supabase/server";

function value(data: FormData, key: string) { const item = data.get(key); return typeof item === "string" ? item.trim() : ""; }
function fail(message: string): never { redirect(`/demo/cliente/novo-atendimento?error=${encodeURIComponent(message)}`); }

export async function createServiceRequest(formData: FormData) {
  const customerName = value(formData, "customerName"); const vehicleBrand = value(formData, "vehicleBrand");
  const vehicleModel = value(formData, "vehicleModel"); const city = value(formData, "city");
  const customerReport = value(formData, "customerReport"); const perceivedUrgency = value(formData, "perceivedUrgency") as ServiceUrgency;
  if (!customerName || !vehicleBrand || !vehicleModel || !city || !customerReport || !urgencyLevels.includes(perceivedUrgency)) fail("Revise os campos obrigatórios.");
  if (customerReport.length < 15) fail("Conte um pouco mais sobre o que aconteceu.");
  const yearRaw = value(formData, "vehicleYear"); const vehicleYear = yearRaw ? Number(yearRaw) : null;
  if (vehicleYear && (!Number.isInteger(vehicleYear) || vehicleYear < 1900 || vehicleYear > new Date().getFullYear() + 1)) fail("Ano do veículo inválido.");

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const input: ServiceCopilotInput = { customerReport, vehicleBrand, vehicleModel, vehicleYear, city, perceivedUrgency };
  const analysis = analyzeServiceRequest(input);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replaceAll("-", "");
  const referenceCode = `VRH-${date}-${randomBytes(2).toString("hex").toUpperCase()}`;
  const { data, error } = await supabase.from("service_requests").insert({
    reference_code: referenceCode, customer_name: customerName, customer_phone: value(formData, "customerPhone") || null,
    vehicle_brand: vehicleBrand, vehicle_model: vehicleModel, vehicle_year: vehicleYear, vehicle_plate: value(formData, "vehiclePlate") || null,
    city, customer_report: customerReport, perceived_urgency: analysis.urgency, service_stage: "solicitado",
    probable_category: analysis.probableCategory, copilot_summary: analysis.summary, copilot_questions: analysis.missingQuestions,
    copilot_risk_signals: analysis.riskSignals, copilot_recommended_next_step: analysis.recommendedNextStep,
    copilot_customer_message: analysis.customerMessage, copilot_concierge_brief: analysis.conciergeBrief,
    copilot_provider_brief: analysis.providerBrief, copilot_confidence: analysis.confidence,
    requires_human_review: analysis.requiresHumanReview, created_by: user.id
  }).select("id").single();
  if (error || !data) fail("Não foi possível criar o atendimento. Tente novamente.");
  revalidatePath("/demo/cliente");
  redirect(`/demo/cliente/atendimento/${data.id}`);
}
