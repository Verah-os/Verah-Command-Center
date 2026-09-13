"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { createSupabaseServerClient } from "@/services/supabase/server";
import {
  isExpenseCategory,
  parseCharging,
  parseDocumentDate,
  parseFuel,
  parseMaintenance,
  parseMileage,
  parseMileageNote,
  type ChargingEntry,
  type FuelEntry,
  type MaintenanceEntry,
} from "@/lib/customer-vehicle-log-contract";

export type VehicleLogActionResult =
  | { ok: true }
  | { ok: false; message: string };

function logPath(vehicleId: string, kind: "mileage" | "fuel" | "expenses" | "maintenance" | "documents", message: string, ok: boolean) {
  return `/demo/cliente/veiculo/${vehicleId}/${kind}?${ok ? "saved" : "error"}=${encodeURIComponent(message)}` as Route;
}

function vehiclePath(vehicleId: string, message: string, ok: boolean) {
  return `/demo/cliente/veiculo/${vehicleId}?${ok ? "saved" : "error"}=${encodeURIComponent(message)}` as Route;
}

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function noteValue(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function run<T>(validated: { ok: true; value: T } | { ok: false; message: string }, write: (value: T) => Promise<VehicleLogActionResult>): Promise<VehicleLogActionResult> {
  return validated.ok ? write(validated.value) : Promise.resolve({ ok: false, message: validated.message });
}

export async function registerVehicleMileageStep(formData: FormData) {
  const vehicleId = text(formData, "vehicleId");
  const mileage = parseMileage(formData.get("mileageValue"), 0, 2000000);
  const note = parseMileageNote(noteValue(formData, "note"));
  if (!mileage.ok) redirect(logPath(vehicleId, "mileage", mileage.message, false));
  if (!note.ok) redirect(logPath(vehicleId, "mileage", note.message, false));

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("register_vehicle_mileage", {
    p_vehicle_id: vehicleId,
    p_mileage: mileage.value,
    p_recorded_at: new Date().toISOString(),
    p_note: note.value ?? null,
    p_idempotency_key: null,
  });
  revalidatePath(`/demo/cliente/veiculo/${vehicleId}`);
  if (error) redirect(logPath(vehicleId, "mileage", error.message, false));
  redirect(logPath(vehicleId, "mileage", "Quilometragem registrada.", true));
}

export async function registerVehicleFuelStep(formData: FormData) {
  const vehicleId = text(formData, "vehicleId");
  const result = await run(parseFuel({
    odometerValue: Number(formData.get("odometerValue")),
    liters: Number(String(formData.get("liters")).replace(",", ".")),
    totalAmount: Number(String(formData.get("totalAmount")).replace(",", ".")),
    fuelType: text(formData, "fuelType"),
    note: noteValue(formData, "note"),
  }), async (value) => {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("register_vehicle_fuel", {
      p_vehicle_id: vehicleId,
      p_recorded_at: new Date().toISOString(),
      p_odometer_value: value.odometerValue,
      p_liters: value.liters,
      p_total_amount: value.totalAmount,
      p_fuel_type: value.fuelType,
      p_note: value.note ?? null,
      p_idempotency_key: null,
    });
    return error ? { ok: false as const, message: error.message } : { ok: true as const };
  });
  revalidatePath(`/demo/cliente/veiculo/${vehicleId}`);
  if (result.ok) redirect(logPath(vehicleId, "fuel", "Abastecimento registrado.", true));
  redirect(logPath(vehicleId, "fuel", result.message, false));
}

export async function registerVehicleChargingStep(formData: FormData) {
  const vehicleId = text(formData, "vehicleId");
  const result = await run(parseCharging({
    odometerValue: Number(formData.get("odometerValue")),
    kwh: Number(String(formData.get("kwh")).replace(",", ".")),
    totalAmount: Number(String(formData.get("totalAmount")).replace(",", ".")),
    batteryPercent: text(formData, "batteryPercent"),
    chargingType: text(formData, "chargingType"),
    note: noteValue(formData, "note"),
  }), async (value) => {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("register_vehicle_charging", {
      p_vehicle_id: vehicleId,
      p_recorded_at: new Date().toISOString(),
      p_odometer_value: value.odometerValue,
      p_kwh: value.kwh,
      p_total_amount: value.totalAmount,
      p_battery_percent: value.batteryPercent,
      p_charging_type: value.chargingType,
      p_note: value.note ?? null,
      p_idempotency_key: null,
    });
    return error ? { ok: false as const, message: error.message } : { ok: true as const };
  });
  revalidatePath(`/demo/cliente/veiculo/${vehicleId}`);
  if (result.ok) redirect(logPath(vehicleId, "fuel", "Recarga registrada.", true));
  redirect(logPath(vehicleId, "fuel", result.message, false));
}

export async function registerVehicleMaintenanceStep(formData: FormData) {
  const vehicleId = text(formData, "vehicleId");
  const amountRaw = text(formData, "amountCents");
  const result = await run(parseMaintenance({
    maintenanceType: text(formData, "maintenanceType"),
    description: text(formData, "description"),
    occurredOn: text(formData, "occurredOn"),
    odometerKm: Number(formData.get("odometerKm")),
    amountCents: amountRaw ? Math.round(Number(amountRaw.replace(",", ".")) * 100) : null,
    nextDueOn: text(formData, "nextDueOn"),
    nextDueKm: Number(text(formData, "nextDueKm") || 0),
    createExpense: formData.get("createExpense") === "on",
  }), async (value: MaintenanceEntry) => {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("register_vehicle_maintenance", {
      p_vehicle_id: vehicleId,
      p_maintenance_type: value.maintenanceType,
      p_description: value.description,
      p_occurred_on: value.occurredOn,
      p_odometer_km: value.odometerKm,
      p_amount_cents: value.amountCents,
      p_next_due_on: value.nextDueOn,
      p_next_due_km: value.nextDueKm,
      p_create_expense: value.createExpense,
      p_idempotency_key: `maintenance:${vehicleId}:${value.maintenanceType}:${value.occurredOn}:${Number(value.odometerKm)}`,
    });
    return error ? { ok: false as const, message: error.message } : { ok: true as const };
  });
  revalidatePath(`/demo/cliente/veiculo/${vehicleId}`);
  if (result.ok) redirect(logPath(vehicleId, "maintenance", "Manutenção registrada.", true));
  redirect(logPath(vehicleId, "maintenance", result.message, false));
}

export async function registerVehicleExpenseStep(formData: FormData) {
  const vehicleId = text(formData, "vehicleId");
  const category = text(formData, "category");
  const description = text(formData, "description") || null;
  const amountRaw = text(formData, "amountCents");
  const occurredOn = text(formData, "occurredOn");
  const odometerRaw = text(formData, "odometerKm");
  if (!isExpenseCategory(category)) {
    redirect(logPath(vehicleId, "expenses", "Selecione uma categoria válida.", false));
  }
  const amount = Math.round(Number(amountRaw.replace(",", ".")) * 100);
  if (!Number.isFinite(amount) || amount <= 0) {
    redirect(logPath(vehicleId, "expenses", "Informe um valor acima de zero.", false));
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
    redirect(logPath(vehicleId, "expenses", "Informe uma data válida.", false));
  }
  const odometerKm = odometerRaw ? Number(odometerRaw) : null;
  if (odometerKm !== null && (!Number.isInteger(odometerKm) || odometerKm < 0 || odometerKm > 2000000)) {
    redirect(logPath(vehicleId, "expenses", "Informe uma quilometragem válida.", false));
  }
  const { data: { user } } = await (async () => {
    const supabase = await createSupabaseServerClient();
    return supabase.auth.getUser();
  })();
  if (!user) redirect(`/login?redirect=/demo/cliente/veiculo/${vehicleId}` as Route);

  const supabase = await createSupabaseServerClient();
  const { data: vehicle, error: vehicleError } = await supabase
    .from("customer_vehicles")
    .select("id,owner_id,customer_id,active")
    .eq("id", vehicleId)
    .eq("owner_id", user.id)
    .eq("active", true)
    .maybeSingle();
  if (vehicleError || !vehicle) redirect(logPath(vehicleId, "expenses", "Veículo não encontrado.", false));
  const { error } = await supabase.from("vehicle_expenses").insert({
    owner_id: user.id,
    customer_id: (vehicle as { customer_id: string }).customer_id,
    vehicle_id: vehicleId,
    category,
    description,
    amount_cents: amount,
    occurred_on: occurredOn,
    odometer_km: odometerKm,
  });
  revalidatePath(`/demo/cliente/veiculo/${vehicleId}`);
  if (error) redirect(logPath(vehicleId, "expenses", error.message, false));
  redirect(logPath(vehicleId, "expenses", "Despesa registrada.", true));
}

export async function registerVehicleDocumentStep(formData: FormData) {
  const vehicleId = text(formData, "vehicleId");
  const documentKind = text(formData, "documentKind");
  const documentDate = text(formData, "documentDate");
  const reference = text(formData, "reference") || null;
  const note = text(formData, "note") || null;
  const file = formData.get("file");

  const expectedKinds = ["nota_fiscal", "garantia", "manual", "laudo", "seguro", "licenciamento", "outro"];
  if (!expectedKinds.includes(documentKind)) {
    redirect(logPath(vehicleId, "documents", "Selecione um tipo de documento válido.", false));
  }
  const date = parseDocumentDate(documentDate);
  if (!date.ok) redirect(logPath(vehicleId, "documents", date.message, false));
  if (reference && reference.length > 200) redirect(logPath(vehicleId, "documents", "Referência muito longa.", false));
  if (note && note.length > 200) redirect(logPath(vehicleId, "documents", "Observação muito longa.", false));
  if (!(file instanceof File)) redirect(logPath(vehicleId, "documents", "Selecione um arquivo.", false));
  if (file.size <= 0 || file.size > 10000000) {
    redirect(logPath(vehicleId, "documents", "O arquivo deve ter até 10 MB.", false));
  }
  const { data: { user } } = await (async () => {
    const supabase = await createSupabaseServerClient();
    return supabase.auth.getUser();
  })();
  if (!user) redirect(`/login?redirect=/demo/cliente/veiculo/${vehicleId}` as Route);
  const supabase = await createSupabaseServerClient();
  const { data: vehicle } = await supabase
    .from("customer_vehicles")
    .select("id,owner_id,customer_id")
    .eq("id", vehicleId)
    .eq("owner_id", user.id)
    .eq("active", true)
    .maybeSingle();
  if (!vehicle) redirect(logPath(vehicleId, "documents", "Veículo não encontrado.", false));
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect(`/login?redirect=/demo/cliente/veiculo/${vehicleId}` as Route);

  const { registerVehicleDocumentSafely } = await import("@/services/customer-vehicle-log/documents");
  const result = await registerVehicleDocumentSafely({
    vehicleId,
    documentKind,
    documentDate: date.value,
    reference,
    note,
    file,
    accessToken: session.access_token,
  });
  revalidatePath(`/demo/cliente/veiculo/${vehicleId}`);
  if (!result.ok) redirect(logPath(vehicleId, "documents", result.message, false));
  redirect(logPath(vehicleId, "documents", "Documento anexado.", true));
}

export async function removeVehicleDocumentStep(formData: FormData) {
  const vehicleId = text(formData, "vehicleId");
  const documentId = text(formData, "documentId");
  if (!documentId) redirect(logPath(vehicleId, "documents", "Documento não encontrado.", false));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("remove_vehicle_document", {
    p_document_id: documentId,
  });
  revalidatePath(`/demo/cliente/veiculo/${vehicleId}`);
  if (error) redirect(logPath(vehicleId, "documents", error.message, false));
  redirect(logPath(vehicleId, "documents", "Documento removido.", true));
}