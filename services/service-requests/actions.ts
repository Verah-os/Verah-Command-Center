"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  analyzeServiceRequest,
  urgencyLevels,
  type ServiceCopilotInput,
  type ServiceUrgency,
} from "@/services/service-copilot";
import { createSupabaseServerClient } from "@/services/supabase/server";
import { isValidVehicle } from "@/data/vehicles";
import { isValidLocation } from "@/data/locations";
import { requireRole } from "@/services/auth/profile";

function value(data: FormData, key: string) {
  const item = data.get(key);
  return typeof item === "string" ? item.trim() : "";
}
function fail(message: string, origin: "customer" | "concierge"): never {
  redirect(
    `${origin === "concierge" ? "/concierge/novo-atendimento" : "/demo/cliente/novo-atendimento"}?error=${encodeURIComponent(message)}`,
  );
}

const insuranceAnswers = ["yes", "no", "unknown"] as const;

export async function createServiceRequest(formData: FormData) {
  return createServiceRequestFromForm(formData, "customer");
}

export async function createConciergeServiceRequest(formData: FormData) {
  await requireRole(["concierge", "admin"]);
  return createServiceRequestFromForm(formData, "concierge");
}

async function createServiceRequestFromForm(
  formData: FormData,
  origin: "customer" | "concierge",
) {
  const customerName = value(formData, "customerName");
  let vehicleBrand = value(formData, "vehicleBrand");
  let vehicleModel = value(formData, "vehicleModel");
  const state = value(formData, "state");
  const city = value(formData, "city");
  const customerReport = value(formData, "customerReport");
  const perceivedUrgency = value(
    formData,
    "perceivedUrgency",
  ) as ServiceUrgency;
  const hasInsurance = value(formData, "hasInsurance");
  const hasRoadsideAssistance = value(
    formData,
    "hasRoadsideAssistance",
  );
  const insurerName = value(formData, "insurerName");
  if (
    !customerName ||
    !vehicleBrand ||
    !vehicleModel ||
    !city ||
    !customerReport ||
    !urgencyLevels.includes(perceivedUrgency) ||
    !insuranceAnswers.includes(
      hasInsurance as (typeof insuranceAnswers)[number],
    ) ||
    !insuranceAnswers.includes(
      hasRoadsideAssistance as (typeof insuranceAnswers)[number],
    )
  )
    fail("Revise os campos obrigatórios.", origin);
  if (insurerName.length > 120)
    fail("O nome da seguradora deve ter no máximo 120 caracteres.", origin);
  if (customerReport.length < 15)
    fail("Conte um pouco mais sobre o que aconteceu.", origin);
  if (!isValidVehicle(vehicleBrand, vehicleModel))
    fail("Selecione uma marca e um modelo válidos.", origin);
  if (!isValidLocation(state, city))
    fail("Selecione um estado e uma cidade válidos.", origin);
  const yearRaw = value(formData, "vehicleYear");
  let vehicleYear = yearRaw ? Number(yearRaw) : null;
  if (
    vehicleYear &&
    (!/^\d{4}$/.test(yearRaw) ||
      !Number.isInteger(vehicleYear) ||
      vehicleYear < 1950 ||
      vehicleYear > new Date().getFullYear() + 1)
  )
    fail("Ano do veículo inválido.", origin);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let vehicleId: string | null = null;
  let vehiclePlate = value(formData, "vehiclePlate") || null;
  if (origin === "customer") {
    const selectedVehicleId = value(formData, "vehicleId");
    if (selectedVehicleId && selectedVehicleId !== "new") {
      const { data: selectedVehicle } = await supabase
        .from("customer_vehicles")
        .select("id,brand,model,year,plate")
        .eq("id", selectedVehicleId)
        .eq("owner_id", user.id)
        .eq("active", true)
        .maybeSingle();
      if (!selectedVehicle)
        fail("O veículo selecionado não está disponível.", origin);
      vehicleId = selectedVehicle.id;
      vehicleBrand = selectedVehicle.brand;
      vehicleModel = selectedVehicle.model;
      vehicleYear = selectedVehicle.year;
      vehiclePlate = selectedVehicle.plate;
    } else {
      const normalizedPlate = normalizePlate(vehiclePlate);
      const { data: candidates } = await supabase
        .from("customer_vehicles")
        .select("id,brand,model,year,plate")
        .eq("owner_id", user.id)
        .eq("active", true)
        .eq("brand", vehicleBrand)
        .eq("model", vehicleModel);
      const match = (candidates ?? []).find(
        (candidate) =>
          candidate.year === vehicleYear &&
          (normalizedPlate
            ? normalizePlate(candidate.plate) === normalizedPlate
            : !normalizePlate(candidate.plate)),
      );
      if (match) {
        vehicleId = match.id;
      } else {
        const { data: createdVehicle, error: vehicleError } = await supabase
          .from("customer_vehicles")
          .insert({
            owner_id: user.id,
            brand: vehicleBrand,
            model: vehicleModel,
            year: vehicleYear,
            plate: vehiclePlate,
            state,
            city,
          })
          .select("id")
          .single();
        if (vehicleError || !createdVehicle)
          fail("Não foi possível vincular o veículo. Tente novamente.", origin);
        vehicleId = createdVehicle.id;
      }
    }
  }

  const input: ServiceCopilotInput = {
    customerReport,
    vehicleBrand,
    vehicleModel,
    vehicleYear,
    city,
    perceivedUrgency,
  };
  const analysis = analyzeServiceRequest(input);
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replaceAll("-", "");
  const referenceCode = `VRH-${date}-${randomBytes(2).toString("hex").toUpperCase()}`;
  const { data, error } = await supabase
    .from("service_requests")
    .insert({
      reference_code: referenceCode,
      customer_name: customerName,
      customer_phone: value(formData, "customerPhone") || null,
      vehicle_id: vehicleId,
      vehicle_brand: vehicleBrand,
      vehicle_model: vehicleModel,
      vehicle_year: vehicleYear,
      vehicle_plate: vehiclePlate,
      state,
      city,
      origin,
      has_insurance: hasInsurance,
      insurer_name: hasInsurance === "yes" ? insurerName || null : null,
      has_roadside_assistance: hasRoadsideAssistance,
      customer_report: customerReport,
      perceived_urgency: analysis.urgency,
      service_stage: "solicitado",
      probable_category: analysis.probableCategory,
      copilot_summary: analysis.summary,
      copilot_questions: analysis.missingQuestions,
      copilot_risk_signals: analysis.riskSignals,
      copilot_recommended_next_step: analysis.recommendedNextStep,
      copilot_customer_message: analysis.customerMessage,
      copilot_concierge_brief: analysis.conciergeBrief,
      copilot_provider_brief: analysis.providerBrief,
      copilot_confidence: analysis.confidence,
      requires_human_review: analysis.requiresHumanReview,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data)
    fail("Não foi possível criar o atendimento. Tente novamente.", origin);
  if (origin === "concierge") {
    revalidatePath("/concierge");
    redirect(`/concierge/${data.id}?created=1`);
  }
  revalidatePath("/demo/cliente");
  redirect(`/demo/cliente/atendimento/${data.id}`);
}

function normalizePlate(plate: string | null) {
  return (plate ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function submitServiceRequestAnswers(formData: FormData) {
  const serviceRequestId = value(formData, "serviceRequestId");
  const answers = Object.fromEntries(
    [...formData.entries()].flatMap(([key, answer]) =>
      key.startsWith("answer:") && typeof answer === "string" && answer.trim()
        ? [[key.slice(7), answer.trim()]]
        : [],
    ),
  );
  if (!serviceRequestId) redirect("/demo/cliente");
  if (!Object.keys(answers).length)
    redirect(
      `/demo/cliente/atendimento/${serviceRequestId}?answersError=${encodeURIComponent("Responda pelo menos uma pergunta antes de salvar.")}`,
    );
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("submit_service_request_answers", {
    p_service_request_id: serviceRequestId,
    p_answers: answers,
  });
  if (error)
    redirect(
      `/demo/cliente/atendimento/${serviceRequestId}?answersError=${encodeURIComponent(error.message)}`,
    );
  revalidatePath(`/demo/cliente/atendimento/${serviceRequestId}`);
  revalidatePath(`/concierge/${serviceRequestId}`);
  redirect(`/demo/cliente/atendimento/${serviceRequestId}?answersSaved=1`);
}
