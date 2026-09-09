export type MaintenanceRecord = {
  id: string;
  vehicle_id: string;
  maintenance_type: string;
  description: string;
  occurred_on: string;
  odometer_km: number;
  amount_cents: number | null;
  next_due_on: string | null;
  next_due_km: number | null;
};

export type MaintenanceInput = Omit<MaintenanceRecord, "id" | "vehicle_id"> & {
  idempotency_key: string;
  create_expense: boolean;
};

export type MaintenanceReminder = MaintenanceRecord & { status: "overdue" | "upcoming" };

// Explicit reference inputs: no clock, scheduler, estimated mileage or side effects.
// The newest occurrence of each normalized maintenance type supersedes older ones.
export function deriveMaintenanceReminders(
  records: MaintenanceRecord[], vehicleId: string, today: string, currentKm: number | null,
): MaintenanceReminder[] {
  const day = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(day)) throw new Error("Invalid reference date");
  const latest = new Map<string, MaintenanceRecord>();
  for (const record of [...records].filter(r => r.vehicle_id === vehicleId).sort((a, b) =>
    b.occurred_on.localeCompare(a.occurred_on) || b.odometer_km - a.odometer_km || b.id.localeCompare(a.id))) {
    const type = record.maintenance_type.trim().toLowerCase();
    if (!latest.has(type)) latest.set(type, record);
  }
  const reminders: MaintenanceReminder[] = [];
  for (const record of latest.values()) {
    const days = record.next_due_on === null ? null : (Date.parse(`${record.next_due_on}T00:00:00Z`) - day) / 86400000;
    const km = record.next_due_km === null || currentKm === null ? null : record.next_due_km - currentKm;
    const overdue = (days !== null && days <= 0) || (km !== null && km <= 0);
    const upcoming = (days !== null && days <= 30) || (km !== null && km <= 1000);
    if (overdue || upcoming) reminders.push({ ...record, status: overdue ? "overdue" : "upcoming" });
  }
  return reminders.sort((a, b) => a.status.localeCompare(b.status) ||
    (a.next_due_on ?? "9999").localeCompare(b.next_due_on ?? "9999") || a.id.localeCompare(b.id));
}
