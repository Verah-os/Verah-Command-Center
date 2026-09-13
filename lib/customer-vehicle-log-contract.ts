// Shared cross-channel validation for the canonical vehicle-log RPC contracts.
// Mirrors the mobile controller (mobile/src/customer-journey.ts) semantics so Web
// and Mobile enforce the same bounds before calling the same Supabase RPCs. Pure
// module: no server-only imports, safe to import from tests on both workspaces.

export const EXPENSE_CATEGORIES = ["combustivel", "manutencao", "outros"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export function isExpenseCategory(value: string): value is ExpenseCategory {
  return (EXPENSE_CATEGORIES as readonly string[]).includes(value);
}

export type FuelEntry = {
  odometerValue: number;
  liters: number;
  totalAmount: number;
  fuelType: string;
  note?: string | null;
};

export type ChargingEntry = {
  odometerValue: number;
  kwh: number;
  totalAmount: number;
  batteryPercent?: number | string | null;
  chargingType?: string | null;
  note?: string | null;
};

export type MaintenanceEntry = {
  maintenanceType: string;
  description: string;
  occurredOn: string;
  odometerKm: number;
  amountCents: number | null;
  nextDueOn?: string | null;
  nextDueKm?: number | null;
  createExpense: boolean;
};

export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

const integerIn = (raw: unknown, min: number, max: number): ParseResult<number> => {
  if (raw === null || raw === undefined || raw === "") return { ok: false, message: "Preencha este campo." };
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value)) return { ok: false, message: "Informe um valor inteiro." };
  if (value < min || value > max) return { ok: false, message: `Informe um valor entre ${min.toLocaleString("pt-BR")} e ${max.toLocaleString("pt-BR")}.` };
  return { ok: true, value };
};

const isoDate = (raw: string): ParseResult<string> => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { ok: false, message: "Informe uma data válida (AAAA-MM-DD)." };
  const parsed = Date.parse(`${raw}T00:00:00Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== raw) {
    return { ok: false, message: "Informe uma data válida." };
  }
  return { ok: true, value: raw };
};

const trimmed = (raw: unknown, minLength: number, maxLength: number, label: string): ParseResult<string> => {
  if (typeof raw !== "string") return { ok: false, message: `Informe ${label}.` };
  const value = raw.trim();
  if (value.length < minLength) return { ok: false, message: `Informe ${label} com pelo menos ${minLength} caracteres.` };
  if (value.length > maxLength) return { ok: false, message: `${label} deve ter no máximo ${maxLength} caracteres.` };
  if (/@|bearer|password|token|service_role|authorization/i.test(value)) {
    return { ok: false, message: `${label} contém conteúdo não permitido.` };
  }
  return { ok: true, value };
};

export function parseMileage(raw: unknown, min: number, max: number): ParseResult<number> {
  return integerIn(raw, min, max);
}

export function parseMileageNote(raw: unknown): ParseResult<string | null> {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, message: "Observação inválida." };
  const value = raw.trim();
  if (!value) return { ok: true, value: null };
  if (value.length > 200) return { ok: false, message: "Observação deve ter no máximo 200 caracteres." };
  if (/@|bearer|password|token|service_role|authorization/i.test(value)) {
    return { ok: false, message: "Observação contém conteúdo não permitido." };
  }
  return { ok: true, value };
}

export function parseFuel(input: FuelEntry): ParseResult<FuelEntry> {
  if (!Number.isInteger(input.odometerValue) || input.odometerValue < 0 || input.odometerValue > 2000000) {
    return { ok: false, message: "Informe o hodômetro atual do veículo." };
  }
  if (!Number.isFinite(input.liters) || input.liters <= 0 || input.liters > 10000) {
    return { ok: false, message: "Informe a quantidade de litros abastecida." };
  }
  if (!Number.isFinite(input.totalAmount) || input.totalAmount < 0) {
    return { ok: false, message: "Informe o valor total do abastecimento." };
  }
  if (!["gasolina", "etanol", "diesel", "gnv"].includes(input.fuelType)) {
    return { ok: false, message: "Selecione um combustível válido." };
  }
  const note = parseMileageNote(input.note ?? null);
  if (!note.ok) return note;
  return { ok: true, value: { ...input, note: note.value } };
}

export function parseCharging(input: ChargingEntry): ParseResult<ChargingEntry> {
  if (!Number.isInteger(input.odometerValue) || input.odometerValue < 0 || input.odometerValue > 2000000) {
    return { ok: false, message: "Informe o hodômetro atual do veículo." };
  }
  if (!Number.isFinite(input.kwh) || input.kwh <= 0 || input.kwh > 10000) {
    return { ok: false, message: "Informe a quantidade de energia (kWh) da recarga." };
  }
  if (!Number.isFinite(input.totalAmount) || input.totalAmount < 0) {
    return { ok: false, message: "Informe o valor total da recarga." };
  }
  let batteryPercent: number | null = null;
  if (input.batteryPercent !== undefined && input.batteryPercent !== null && String(input.batteryPercent).trim() !== "") {
    batteryPercent = Number(input.batteryPercent);
    if (!Number.isFinite(batteryPercent) || batteryPercent < 0 || batteryPercent > 100) {
      return { ok: false, message: "Informe um percentual de bateria entre 0 e 100." };
    }
  }
  let chargingType: string | null = null;
  if (input.chargingType !== undefined && input.chargingType !== null && String(input.chargingType).trim() !== "") {
    chargingType = String(input.chargingType);
    if (!["recarga_domestica", "recarga_publica", "recarga_rapida", "outro"].includes(chargingType)) {
      return { ok: false, message: "Selecione um tipo de recarga válido." };
    }
  }
  const note = parseMileageNote(input.note ?? null);
  if (!note.ok) return note;
  return { ok: true, value: { ...input, batteryPercent, chargingType, note: note.value } };
}

export function parseMaintenance(raw: MaintenanceEntry): ParseResult<MaintenanceEntry> {
  if (typeof raw.maintenanceType !== "string" || !raw.maintenanceType.trim()) {
    return { ok: false, message: "Selecione o tipo de manutenção." };
  }
  const type = raw.maintenanceType.trim().toLowerCase();
  if (type.length > 80) return { ok: false, message: "Tipo de manutenção muito longo." };
  const description = trimmed(raw.description, 1, 160, "a descrição");
  if (!description.ok) return description;
  const occurred = isoDate(raw.occurredOn);
  if (!occurred.ok) return occurred;
  const mileage = integerIn(raw.odometerKm, 0, 2000000);
  if (!mileage.ok) return mileage;
  let amountCents: number | null = null;
  if (raw.amountCents === null || raw.amountCents === undefined || raw.amountCents === 0 || Number.isNaN(Number(raw.amountCents))) {
    amountCents = null;
  } else {
    const parsed = Number(raw.amountCents);
    if (!Number.isInteger(parsed) || parsed < 0) return { ok: false, message: "Informe um valor de custo válido." };
    amountCents = parsed;
  }
  let nextDueOn: string | null = null;
  if (raw.nextDueOn !== undefined && raw.nextDueOn !== null && String(raw.nextDueOn).trim() !== "") {
    const parsedDate = isoDate(String(raw.nextDueOn));
    if (!parsedDate.ok) return parsedDate;
    nextDueOn = parsedDate.value;
  }
  let nextDueKm: number | null = null;
  if (raw.nextDueKm !== undefined && raw.nextDueKm !== null && raw.nextDueKm !== 0) {
    const parsedKm = integerIn(Number(raw.nextDueKm), 0, 2000000);
    if (!parsedKm.ok) return parsedKm;
    nextDueKm = parsedKm.value;
  }
  if (raw.createExpense && (amountCents === null || amountCents <= 0)) {
    return { ok: false, message: "Para registrar a despesa, informe um custo acima de zero." };
  }
  return { ok: true, value: { maintenanceType: type, description: description.value, occurredOn: occurred.value, odometerKm: mileage.value, amountCents, nextDueOn, nextDueKm, createExpense: raw.createExpense } };
}

export function parseDocumentDate(raw: string): ParseResult<string> {
  return isoDate(raw);
}

// Canonical vehicle-document upload bound shared by Web and Mobile. Mirrors
// mobile/src/vehicle-documents.ts MAX_VEHICLE_DOCUMENT_BYTES = 10 MiB, the
// `vehicle-documents` storage bucket limit and the DB check (23514) constraint.
export const MAX_VEHICLE_DOCUMENT_BYTES = 10 * 1024 * 1024;

export const VEHICLE_DOCUMENT_KINDS = [
  "nota_fiscal",
  "garantia",
  "manual",
  "laudo",
  "seguro",
  "licenciamento",
  "outro",
] as const;
export type VehicleDocumentKind = (typeof VEHICLE_DOCUMENT_KINDS)[number];

export const VEHICLE_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export type VehicleDocumentMimeType = (typeof VEHICLE_DOCUMENT_MIME_TYPES)[number];

// Cross-channel filename normalization used by both clients. Mobile keeps the
// full trimmed filename (up to the 255-char DB bound) without replacing
// characters; Web previously shortened/replaced names, which changed the file
// name and the deterministic idempotency key and allowed the same upload to be
// registered twice across channels. Mirroring Mobile's contract keeps the
// canonical reservation reusable from either channel.
export function normalizeVehicleDocumentFileName(raw: string): string {
  const fileName = raw.trim();
  if (!fileName || fileName.length > 255) return "";
  return fileName;
}

export function vehicleDocumentIdempotencyKey(input: {
  documentKind: string;
  documentDate: string;
  fileName: string;
  sizeBytes: number;
}): string {
  return [
    "vehicle-document",
    input.documentKind.trim().toLowerCase(),
    input.documentDate,
    input.fileName.trim(),
    String(input.sizeBytes),
  ].join(":");
}

// Latest energy activity for the vehicle summary: compare the last fuel and
// last charging records by their recorded_at timestamps and return whichever
// actually happened most recently (mixed-power vehicles must not always show
// fuel, even when a newer charging record exists).
export function pickLatestEnergy(
  latestFuel: { recorded_at: string } | null,
  latestCharging: { recorded_at: string } | null,
): { kind: "fuel" } | { kind: "charging" } | null {
  if (!latestFuel && !latestCharging) return null;
  if (!latestFuel) return { kind: "charging" };
  if (!latestCharging) return { kind: "fuel" };
  return new Date(latestCharging.recorded_at).getTime() > new Date(latestFuel.recorded_at).getTime()
    ? { kind: "charging" }
    : { kind: "fuel" };
}