"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { isValidLocation } from "@/data/locations";
import { requireRole } from "@/services/auth/profile";
import { createSupabaseServerClient } from "@/services/supabase/server";
import { createLocalVehicleIntelligenceProvider } from "@/services/vehicle-intelligence/local-provider";
import {
  lookupVehicleForOnboarding,
  normalizeBrazilianPlate,
  prepareManualVehicle,
} from "@/services/customer-vehicles/onboarding";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function vehiclePath(id: string, message: string, kind: "saved" | "error") {
  return `/demo/cliente/veiculo/${id}?${kind}=${encodeURIComponent(message)}` as Route;
}

function onboardingPath(params: Record<string, string>) {
  return `/onboarding/cliente?${new URLSearchParams(params).toString()}` as Route;
}

export async function lookupCustomerVehicleForOnboarding(formData: FormData) {
  await requireRole(["customer"]);
  const plate = normalizeBrazilianPlate(text(formData, "plate"));
  if (!plate) redirect(onboardingPath({ step: "vehicle", error: "invalid_plate" }));

  const result = await lookupVehicleForOnboarding(plate, [
    createLocalVehicleIntelligenceProvider(),
  ]);
  if (result.status === "manual_required") {
    redirect(onboardingPath({ step: "vehicle", mode: "manual", plate }));
  }
  redirect(onboardingPath({
    step: "vehicle",
    mode: "suggested",
    plate,
    brand: result.vehicle.brand,
    model: result.vehicle.model,
    year: String(result.vehicle.modelYear),
    version: result.vehicle.version ?? "",
    engine: result.vehicle.engine ?? "",
    transmission: result.vehicle.transmission ?? "",
    source: result.provenance.provider,
  }));
}

export async function confirmCustomerVehicleOnboarding(formData: FormData) {
  await requireRole(["customer"]);
  if (formData.get("customer_confirmed") !== "on") {
    redirect(onboardingPath({ step: "vehicle", error: "confirmation_required" }));
  }
  const plateInput = text(formData, "plate");
  const mode = text(formData, "mode");
  let draft: ReturnType<typeof prepareManualVehicle>;
  let lookupProvider: string | null = null;
  let observedAt: string | null = null;

  try {
    if (mode === "suggested") {
      const result = await lookupVehicleForOnboarding(plateInput, [
        createLocalVehicleIntelligenceProvider(),
      ]);
      if (result.status !== "suggested" || !result.provenance.synthetic) {
        throw new Error("stale_lookup");
      }
      draft = {
        plate: result.plate,
        brand: result.vehicle.brand,
        model: result.vehicle.model,
        modelYear: result.vehicle.modelYear,
        version: result.vehicle.version ?? null,
        engine: result.vehicle.engine ?? null,
        transmission: result.vehicle.transmission ?? null,
        source: "local_fixture" as const,
        synthetic: true,
        confirmed: false as const,
      };
      lookupProvider = result.provenance.provider;
      observedAt = result.provenance.observedAt;
    } else {
      draft = prepareManualVehicle({
        plate: plateInput,
        brand: text(formData, "brand"),
        model: text(formData, "model"),
        modelYear: text(formData, "model_year"),
        version: text(formData, "version"),
        engine: text(formData, "engine_type"),
        transmission: text(formData, "transmission"),
      });
    }
  } catch {
    redirect(onboardingPath({ step: "vehicle", error: "invalid_vehicle" }));
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("confirm_customer_vehicle", {
    p_plate: draft.plate,
    p_brand: draft.brand,
    p_model: draft.model,
    p_model_year: draft.modelYear,
    p_version: draft.version,
    p_engine_type: draft.engine,
    p_transmission: draft.transmission,
    p_lookup_source: draft.source,
    p_lookup_provider: lookupProvider,
    p_source_observed_at: observedAt,
    p_source_synthetic: draft.synthetic,
    p_customer_confirmed: true,
  });
  if (error || !(data as { vehicle_id?: string } | null)?.vehicle_id) {
    redirect(onboardingPath({ step: "vehicle", error: "save_failed" }));
  }
  revalidatePath("/onboarding/cliente");
  revalidatePath("/demo/cliente");
  redirect(onboardingPath({ saved: "1" }));
}

export async function updateCustomerVehicle(formData: FormData) {
  await requireRole(["customer"]);
  const vehicleId = text(formData, "vehicleId");
  const nickname = text(formData, "nickname");
  const mileageRaw = text(formData, "currentMileage");
  const state = text(formData, "state");
  const city = text(formData, "city");
  if (!vehicleId) redirect("/demo/cliente");
  if (nickname.length > 60) {
    redirect(vehiclePath(vehicleId, "O apelido deve ter no máximo 60 caracteres.", "error"));
  }
  const currentMileage = mileageRaw === "" ? null : Number(mileageRaw);
  if (
    currentMileage !== null &&
    (!/^\d+$/.test(mileageRaw) || !Number.isSafeInteger(currentMileage))
  ) {
    redirect(vehiclePath(vehicleId, "Informe uma quilometragem válida.", "error"));
  }
  if ((state || city) && !isValidLocation(state, city)) {
    redirect(vehiclePath(vehicleId, "Selecione um estado e uma cidade válidos.", "error"));
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await supabase
    .from("customer_vehicles")
    .update({
      nickname: nickname || null,
      current_mileage: currentMileage,
      state: state || null,
      city: city || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", vehicleId)
    .eq("owner_id", user.id);
  if (error) {
    redirect(vehiclePath(vehicleId, "Não foi possível salvar. Tente novamente.", "error"));
  }
  revalidatePath("/demo/cliente");
  revalidatePath(`/demo/cliente/veiculo/${vehicleId}`);
  redirect(vehiclePath(vehicleId, "Informações do veículo atualizadas.", "saved"));
}
