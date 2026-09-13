import type { CustomerVehicle } from "@/types/customer-vehicle";
import type { MaintenanceRecordRaw } from "./types";

// Deterministic reminder derivation from the canonical next-care fields, shared
// between the web maintenance tab and the vehicle log home. No reminders are
// invented: only explicit next_due_on/next_due_km values from the RPC are used.

export type MaintenanceReminder = {
  label: string;
  dueOn: string | null;
  dueKm: number | null;
};

function todayIso(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function deriveMaintenanceReminders(
  records: MaintenanceRecordRaw[],
  vehicle: Pick<CustomerVehicle, "currentMileage" | "nextServiceDate" | "nextServiceMileage">,
): MaintenanceReminder[] {
  const reminders: MaintenanceReminder[] = [];
  const today = todayIso();
  const upcoming: MaintenanceReminder[] = [];

  for (const record of records) {
    if (record.next_due_on && record.next_due_on >= today) upcoming.push({ label: record.description, dueOn: record.next_due_on, dueKm: record.next_due_km });
    else if (record.next_due_km !== null && vehicle.currentMileage !== null && record.next_due_km >= vehicle.currentMileage) {
      upcoming.push({ label: record.description, dueOn: record.next_due_on, dueKm: record.next_due_km });
    }
  }
  upcoming.sort((left, right) =>
    (left.dueOn ?? "9999").localeCompare(right.dueOn ?? "9999")
    || (left.dueKm ?? Infinity) - (right.dueKm ?? Infinity),
  );

  if (vehicle.nextServiceDate && vehicle.nextServiceDate >= today) {
    reminders.push({ label: "Próxima revisão informada", dueOn: vehicle.nextServiceDate, dueKm: vehicle.nextServiceMileage });
  } else if (vehicle.nextServiceMileage !== null && vehicle.currentMileage !== null && vehicle.nextServiceMileage >= vehicle.currentMileage) {
    reminders.push({ label: "Próxima revisão informada", dueOn: vehicle.nextServiceDate, dueKm: vehicle.nextServiceMileage });
  }
  reminders.push(...upcoming);
  return reminders;
}