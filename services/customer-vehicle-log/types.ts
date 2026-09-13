// Read-only projections over canonical vehicle-log tables. Web and Mobile consume
// the same canonical Supabase tables/RPCs; these types only mirror the shared
// row shapes (mobile/src/customer-journey.ts) without duplicating domain logic.

export type MileageLogRaw = {
  id: string;
  vehicle_id: string;
  recorded_at: string;
  mileage_value: number;
  note: string | null;
  created_at: string;
};

export type FuelLogRaw = {
  id: string;
  vehicle_id: string;
  recorded_at: string;
  odometer_value: number;
  liters: number;
  total_amount: number;
  fuel_type: string;
  consumption_kmpl: number | null;
  note: string | null;
  created_at: string;
};

export type ChargingLogRaw = {
  id: string;
  vehicle_id: string;
  recorded_at: string;
  odometer_value: number;
  kwh: number;
  total_amount: number;
  battery_percent: number | null;
  charging_type: string | null;
  consumption_km_kwh: number | null;
  note: string | null;
  created_at: string;
};

export type MaintenanceRecordRaw = {
  id: string;
  vehicle_id: string;
  maintenance_type: string;
  description: string;
  occurred_on: string;
  odometer_km: number;
  amount_cents: number | null;
  next_due_on: string | null;
  next_due_km: number | null;
  created_at: string;
};

export type ExpenseRow = {
  id: string;
  vehicle_id: string;
  category: "combustivel" | "manutencao" | "outros";
  description: string | null;
  amount_cents: number;
  occurred_on: string;
  odometer_km: number | null;
  created_at: string;
};

export type VehicleDocumentRow = {
  id: string;
  vehicle_id: string;
  document_kind: string;
  document_date: string;
  reference: string | null;
  note: string | null;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  storage_bucket: string;
  storage_path: string;
  status: "active" | "removed";
  created_at: string;
};

export type VehicleExpenseSummaryRaw = {
  total_cents: number;
  fuel_cents: number;
  maintenance_cents: number;
  other_cents: number;
  expense_count: number;
  distance_km: number | null;
  cost_per_km_cents: number | null;
};