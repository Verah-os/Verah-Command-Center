import type { CustomerVehicle } from "@/types/customer-vehicle";

export type MileageLogRow = {
  id: string;
  vehicleId: string;
  recordedAt: string;
  mileageValue: number;
  note: string | null;
  createdAt: string;
};

export type FuelLogRow = {
  id: string;
  vehicleId: string;
  recordedAt: string;
  odometerValue: number;
  liters: number;
  totalAmount: number;
  fuelType: string;
  consumptionKmpl: number | null;
  note: string | null;
  createdAt: string;
};

export type ChargingLogRow = {
  id: string;
  vehicleId: string;
  recordedAt: string;
  odometerValue: number;
  kwh: number;
  totalAmount: number;
  batteryPercent: number | null;
  chargingType: string | null;
  consumptionKmKwh: number | null;
  note: string | null;
  createdAt: string;
};

export type MaintenanceRecordRow = {
  id: string;
  vehicleId: string;
  maintenanceType: string;
  description: string;
  occurredOn: string;
  odometerKm: number;
  amountCents: number | null;
  nextDueOn: string | null;
  nextDueKm: number | null;
  createdAt: string;
};

export type ExpenseRow = {
  id: string;
  vehicleId: string;
  category: "combustivel" | "manutencao" | "outros";
  description: string | null;
  amountCents: number;
  occurredOn: string;
  odometerKm: number | null;
  createdAt: string;
};

export type VehicleDocumentRow = {
  id: string;
  vehicleId: string;
  documentKind: string;
  documentDate: string;
  reference: string | null;
  note: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageBucket: string;
  storagePath: string;
  status: "active" | "removed";
  createdAt: string;
};

export type VehicleExpenseSummary = {
  totalCents: number;
  fuelCents: number;
  maintenanceCents: number;
  otherCents: number;
  expenseCount: number;
  distanceKm: number | null;
  costPerKmCents: number | null;
};

export const VEHICLE_LOG_CURRENCY = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export const VEHICLE_LOG_DATE = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
});

export const VEHICLE_LOG_DATETIME = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

export const FUEL_TYPES = ["gasolina", "etanol", "diesel", "gnv"] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export const FUEL_TYPE_LABELS: Record<FuelType, string> = {
  gasolina: "Gasolina",
  etanol: "Etanol",
  diesel: "Diesel",
  gnv: "GNV",
};

export const CHARGING_TYPES = [
  "recarga_domestica",
  "recarga_publica",
  "recarga_rapida",
  "outro",
] as const;
export type ChargingType = (typeof CHARGING_TYPES)[number];

export const CHARGING_TYPE_LABELS: Record<ChargingType, string> = {
  recarga_domestica: "Doméstica",
  recarga_publica: "Pública",
  recarga_rapida: "Rápida",
  outro: "Outro",
};

export const MAINTENANCE_TYPES = [
  "oleo",
  "filtros",
  "pneus",
  "freios",
  "bateria",
  "suspensao",
  "revisao",
  "correias",
  "arrefecimento",
  "outro",
] as const;
export type MaintenanceType = (typeof MAINTENANCE_TYPES)[number];

export const MAINTENANCE_TYPE_LABELS: Record<MaintenanceType, string> = {
  oleo: "Troca de óleo",
  filtros: "Filtros",
  pneus: "Pneus",
  freios: "Freios",
  bateria: "Bateria",
  suspensao: "Suspensão",
  revisao: "Revisão",
  correias: "Correias",
  arrefecimento: "Arrefecimento",
  outro: "Outro",
};

export const DOCUMENT_KINDS = [
  "nota_fiscal",
  "garantia",
  "manual",
  "laudo",
  "seguro",
  "licenciamento",
  "outro",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  nota_fiscal: "Nota fiscal",
  garantia: "Garantia",
  manual: "Manual",
  laudo: "Laudo",
  seguro: "Seguro",
  licenciamento: "Licenciamento",
  outro: "Outro",
};

export function formatBrzlCents(cents: number | null) {
  if (cents === null || !Number.isFinite(cents)) return "—";
  return VEHICLE_LOG_CURRENCY.format(cents / 100);
}

export function formatEnergyQuantity(quantity: number, unit: "L" | "kWh") {
  return `${quantity.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${unit}`;
}

export function formatDecimal(value: number | null) {
  if (value === null) return "—";
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

export function chargingTypeLabel(type: string | null | undefined) {
  if (type && type in CHARGING_TYPE_LABELS) return CHARGING_TYPE_LABELS[type as ChargingType];
  return "Recarga";
}

export function fuelTypeLabel(type: string | null | undefined) {
  if (type && type in FUEL_TYPE_LABELS) return FUEL_TYPE_LABELS[type as FuelType];
  return "Combustível";
}

export function maintenanceTypeLabel(type: string) {
  if (type in MAINTENANCE_TYPE_LABELS) return MAINTENANCE_TYPE_LABELS[type as MaintenanceType];
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function documentKindLabel(kind: string | null | undefined) {
  if (kind && kind in DOCUMENT_KIND_LABELS) return DOCUMENT_KIND_LABELS[kind as DocumentKind];
  return "Documento";
}

export function vehicleLogTitle(vehicle: Pick<CustomerVehicle, "nickname" | "brand" | "model">) {
  return vehicle.nickname ?? `${vehicle.brand} ${vehicle.model}`;
}

export function mileageReminder(vehicle: CustomerVehicle): string | null {
  if (vehicle.nextServiceDate) return `Próximo cuidado informado para ${VEHICLE_LOG_DATE.format(new Date(`${vehicle.nextServiceDate}T12:00:00-03:00`))}`;
  if (vehicle.nextServiceMileage !== null) return `Próximo cuidado aos ${vehicle.nextServiceMileage.toLocaleString("pt-BR")} km`;
  return null;
}