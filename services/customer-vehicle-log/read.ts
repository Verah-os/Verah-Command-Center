import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/services/supabase/server";
import { getCustomerVehicle } from "@/services/customer-vehicles/customer-vehicles-service";
import type { CustomerVehicle } from "@/types/customer-vehicle";
import {
  type ChargingLogRaw,
  type ExpenseRow,
  type FuelLogRaw,
  type MaintenanceRecordRaw,
  type MileageLogRaw,
  type VehicleDocumentRow,
  type VehicleExpenseSummaryRaw,
} from "./types";

// All reads go through the same canonical tables/RLS as Mobile. Queries return
// null on RLS-filtered/missing rows so the UI can render the empty state.

export async function getCustomerVehicleLogBase(vehicleId: string): Promise<CustomerVehicle> {
  const vehicle = await getCustomerVehicle(vehicleId);
  if (!vehicle) notFound();
  return vehicle;
}

function newestFirst<T extends { recorded_at: string; created_at: string }>(rows: T[]): T[] {
  return [...rows].sort((left, right) =>
    new Date(right.recorded_at).getTime() - new Date(left.recorded_at).getTime()
    || new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  );
}

export async function listMileageLogs(vehicleId: string): Promise<MileageLogRaw[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("vehicle_mileage_logs")
    .select("id,vehicle_id,recorded_at,mileage_value,note,created_at")
    .eq("vehicle_id", vehicleId)
    .order("recorded_at", { ascending: false });
  return newestFirst((data ?? []) as MileageLogRaw[]);
}

export async function listFuelLogs(vehicleId: string): Promise<FuelLogRaw[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("vehicle_fuel_logs")
    .select("id,vehicle_id,recorded_at,odometer_value,liters,total_amount,fuel_type,consumption_kmpl,note,created_at")
    .eq("vehicle_id", vehicleId)
    .order("recorded_at", { ascending: false });
  return newestFirst((data ?? []) as FuelLogRaw[]);
}

export async function listChargingLogs(vehicleId: string): Promise<ChargingLogRaw[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("vehicle_charging_logs")
    .select("id,vehicle_id,recorded_at,odometer_value,kwh,total_amount,battery_percent,charging_type,consumption_km_kwh,note,created_at")
    .eq("vehicle_id", vehicleId)
    .order("recorded_at", { ascending: false });
  return newestFirst((data ?? []) as ChargingLogRaw[]);
}

export async function listMaintenanceRecords(vehicleId: string): Promise<MaintenanceRecordRaw[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("vehicle_maintenance_records")
    .select("id,vehicle_id,maintenance_type,description,occurred_on,odometer_km,amount_cents,next_due_on,next_due_km,created_at")
    .eq("vehicle_id", vehicleId)
    .order("occurred_on", { ascending: false });
  return (data ?? []) as MaintenanceRecordRaw[];
}

export async function listVehicleExpenses(vehicleId: string): Promise<ExpenseRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("vehicle_expenses")
    .select("id,vehicle_id,category,description,amount_cents,occurred_on,odometer_km,created_at")
    .eq("vehicle_id", vehicleId)
    .order("occurred_on", { ascending: false });
  return (data ?? []) as ExpenseRow[];
}

export async function getVehicleExpenseSummary(vehicleId: string): Promise<VehicleExpenseSummaryRaw | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("vehicle_expense_summary", { p_vehicle_id: vehicleId });
  return (data as VehicleExpenseSummaryRaw | null) ?? null;
}

export async function listVehicleDocuments(vehicleId: string): Promise<VehicleDocumentRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("vehicle_documents")
    .select("id,vehicle_id,document_kind,document_date,reference,note,file_name,mime_type,size_bytes,storage_bucket,storage_path,status,created_at")
    .eq("vehicle_id", vehicleId)
    .eq("status", "active")
    .order("created_at", { ascending: false });
  return (data ?? []) as VehicleDocumentRow[];
}

export type VehicleLogHome = {
  vehicle: CustomerVehicle;
  mileageLogs: MileageLogRaw[];
  fuelLogs: FuelLogRaw[];
  chargingLogs: ChargingLogRaw[];
  latestMileage: MileageLogRaw | null;
  latestFuel: FuelLogRaw | null;
  latestCharging: ChargingLogRaw | null;
  maintenanceRecords: MaintenanceRecordRaw[];
  expenseSummary: VehicleExpenseSummaryRaw | null;
  documentCount: number;
};

export async function loadVehicleLogHome(vehicleId: string): Promise<VehicleLogHome> {
  const vehicle = await getCustomerVehicleLogBase(vehicleId);
  const [mileageLogs, fuelLogs, chargingLogs, maintenanceRecords, expenseSummary, documents] = await Promise.all([
    listMileageLogs(vehicleId),
    listFuelLogs(vehicleId),
    listChargingLogs(vehicleId),
    listMaintenanceRecords(vehicleId),
    getVehicleExpenseSummary(vehicleId),
    listVehicleDocuments(vehicleId),
  ]);
  return {
    vehicle,
    mileageLogs,
    fuelLogs,
    chargingLogs,
    latestMileage: mileageLogs[0] ?? null,
    latestFuel: fuelLogs[0] ?? null,
    latestCharging: chargingLogs[0] ?? null,
    maintenanceRecords,
    expenseSummary,
    documentCount: documents.length,
  };
}

export type FuelChargingHome = {
  vehicle: CustomerVehicle;
  fuelLogs: FuelLogRaw[];
  chargingLogs: ChargingLogRaw[];
};

export async function loadFuelChargingHome(vehicleId: string): Promise<FuelChargingHome> {
  const vehicle = await getCustomerVehicleLogBase(vehicleId);
  const [fuelLogs, chargingLogs] = await Promise.all([
    listFuelLogs(vehicleId),
    listChargingLogs(vehicleId),
  ]);
  return { vehicle, fuelLogs, chargingLogs };
}

export type ExpensesHome = {
  vehicle: CustomerVehicle;
  expenses: ExpenseRow[];
  summary: VehicleExpenseSummaryRaw | null;
};

export async function loadExpensesHome(vehicleId: string): Promise<ExpensesHome> {
  const vehicle = await getCustomerVehicleLogBase(vehicleId);
  const [expenses, summary] = await Promise.all([
    listVehicleExpenses(vehicleId),
    getVehicleExpenseSummary(vehicleId),
  ]);
  return { vehicle, expenses, summary };
}

export async function loadDocumentsHome(vehicleId: string): Promise<{ vehicle: CustomerVehicle; documents: VehicleDocumentRow[] }> {
  const vehicle = await getCustomerVehicleLogBase(vehicleId);
  const documents = await listVehicleDocuments(vehicleId);
  return { vehicle, documents };
}

export async function loadMaintenanceHome(vehicleId: string): Promise<{
  vehicle: CustomerVehicle;
  maintenanceRecords: MaintenanceRecordRaw[];
  reminder: string | null;
}> {
  const vehicle = await getCustomerVehicleLogBase(vehicleId);
  const maintenanceRecords = await listMaintenanceRecords(vehicleId);
  const { deriveMaintenanceReminders } = await import("@/services/customer-vehicle-log/maintenance-reminders");
  const reminderRecords = deriveMaintenanceReminders(maintenanceRecords, vehicle);
  return { vehicle, maintenanceRecords, reminder: reminderRecords[0]?.label ?? null };
}