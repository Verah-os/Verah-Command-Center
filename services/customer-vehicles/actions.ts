"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { isValidLocation } from "@/data/locations";
import { requireRole } from "@/services/auth/profile";
import { createSupabaseServerClient } from "@/services/supabase/server";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function vehiclePath(id: string, message: string, kind: "saved" | "error") {
  return `/demo/cliente/veiculo/${id}?${kind}=${encodeURIComponent(message)}` as Route;
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
