import type { MaintenanceInput, MaintenanceRecord } from "./maintenance";
import type { VehicleDocument, VehicleDocumentInput, VehicleDocumentRegisterData } from "./vehicle-documents.ts";
import { sortVehicleDocuments } from "./vehicle-documents.ts";
export type { VehicleDocument, VehicleDocumentInput, VehicleDocumentKind, VehicleDocumentMimeType } from "./vehicle-documents";
export const ONBOARDING_TERMS_VERSION = "pilot-alpha-onboarding-v1";
export const FUEL_UNAVAILABLE_MESSAGE = "Abastecimentos indisponíveis no momento. Tente novamente em instantes.";
export const CHARGING_UNAVAILABLE_MESSAGE = "Recargas indisponíveis no momento. Tente novamente em instantes.";
export const HOME_LOAD_UNAVAILABLE_MESSAGE = "Não foi possível carregar sua área VERAH no momento. Tente novamente em instantes.";

export type JourneyUser = { id: string; email?: string };
export type GarageVehicle = { id: string; brand: string; model: string; year: number | null; plate: string | null; nickname: string | null; current_mileage?: number | null; currentMileage?: number | null };
export type VehicleExpenseSummary = {
  totalCents: number;
  fuelCents: number;
  maintenanceCents: number;
  otherCents: number;
  expenseCount: number;
  distanceKm: number | null;
  costPerKmCents: number | null;
};
export const EXPENSE_CATEGORIES = ["combustivel", "manutencao", "outros"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  combustivel: "Combustível",
  manutencao: "Manutenção",
  outros: "Outros",
};
export type ExpenseInput = {
  category: ExpenseCategory;
  amountCents: number;
  occurredOn: string;
  odometerKm?: number | null;
  description?: string | null;
};
export function expenseCategoryLabel(category: string): string {
  return category in EXPENSE_CATEGORY_LABELS
    ? EXPENSE_CATEGORY_LABELS[category as ExpenseCategory]
    : category.charAt(0).toUpperCase() + category.slice(1);
}
export function mapExpenseCategory(value: string): ExpenseCategory | null {
  return (EXPENSE_CATEGORIES as readonly string[]).includes(value)
    ? value as ExpenseCategory
    : null;
}
export type CustomerServiceRequest = {
  id: string;
  referenceCode: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleYear: number | null;
  city: string | null;
  state: string | null;
  serviceStage: string;
  customerReport: string | null;
  customerMessage: string | null;
  probableCategory: string | null;
  copilotSummary: string | null;
  perceivedUrgency: string | null;
  conciergeAcceptedAt: string | null;
  providerAssignedAt: string | null;
  completedAt: string | null;
  completionNotes: string | null;
  customerRating: number | null;
  createdAt: string;
};
export type VehicleDraft = { plate: string; brand: string; model: string; modelYear: number; version: string | null; engine: string | null; transmission: string | null };
export type VehicleInput = { plate: string; brand: string; model: string; modelYear: string | number; version?: string; engine?: string; transmission?: string };
export type JourneyResult = { ok: true } | { ok: false; message: string };
type RpcError = { message: string } | null;

export type MileageLog = {
  id: string;
  vehicleId: string;
  recordedAt: string;
  mileageValue: number;
  note: string | null;
  createdAt: string;
};
export type MileageInput = {
  mileageValue: string | number;
  recordedAt?: string;
  note?: string;
};
export type MileageResults = { logs: MileageLog[]; latest: MileageLog | null; nextMinimum: number };

export const FUEL_TYPES = ["gasolina", "etanol", "diesel", "gnv"] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export type FuelLog = {
  id: string;
  vehicleId: string;
  recordedAt: string;
  odometerValue: number;
  liters: number;
  totalAmount: number;
  fuelType: FuelType;
  consumptionKmpl: number | null;
  note: string | null;
  createdAt: string;
};
export type FuelInput = {
  odometerValue: string | number;
  liters: string | number;
  totalAmount: string | number;
  fuelType: FuelType;
  recordedAt?: string;
  note?: string;
};
export type FuelResults = { logs: FuelLog[]; latest: FuelLog | null; nextMinimum: number };

export const CHARGING_TYPES = ["recarga_domestica", "recarga_publica", "recarga_rapida", "outro"] as const;
export type ChargingType = (typeof CHARGING_TYPES)[number];

export const CHARGING_TYPE_LABELS: Record<ChargingType, string> = {
  recarga_domestica: "Recarga doméstica",
  recarga_publica: "Recarga pública",
  recarga_rapida: "Recarga rápida",
  outro: "Outro",
};

export function chargingTypeLabel(type: ChargingType | null | undefined): string {
  return type ? CHARGING_TYPE_LABELS[type] : "Recarga";
}

export type EnergyKind = "fuel" | "charging";

export type EnergyHistoryEntry = {
  kind: EnergyKind;
  id: string;
  recordedAt: string;
  odometerValue: number;
  quantity: number;
  unit: "L" | "kWh";
  totalAmount: number;
  fuelType?: FuelType;
  chargingType?: ChargingType | null;
  batteryPercent?: number | null;
  efficiency: number | null;
  note: string | null;
};

export function formatEnergyQuantity(quantity: number, unit: "L" | "kWh"): string {
  return `${quantity.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${unit}`;
}

export function formatEnergyEfficiency(entry: EnergyHistoryEntry): string {
  if (entry.efficiency === null) return "Sem intervalo válido para calcular consumo.";
  return entry.kind === "fuel"
    ? `Consumo ${entry.efficiency.toLocaleString("pt-BR")} km/L`
    : `Eficiência ${entry.efficiency.toLocaleString("pt-BR")} km/kWh`;
}

export function mergeEnergyHistory(fuelLogs: FuelLog[], chargingLogs: ChargingLog[]): EnergyHistoryEntry[] {
  const fuelEntries: EnergyHistoryEntry[] = fuelLogs.map((log) => ({
    kind: "fuel" as const,
    id: log.id,
    recordedAt: log.recordedAt,
    odometerValue: log.odometerValue,
    quantity: log.liters,
    unit: "L" as const,
    totalAmount: log.totalAmount,
    fuelType: log.fuelType,
    chargingType: undefined,
    batteryPercent: undefined,
    efficiency: log.consumptionKmpl,
    note: log.note,
  }));
  const chargingEntries: EnergyHistoryEntry[] = chargingLogs.map((log) => ({
    kind: "charging" as const,
    id: log.id,
    recordedAt: log.recordedAt,
    odometerValue: log.odometerValue,
    quantity: log.kwh,
    unit: "kWh" as const,
    totalAmount: log.totalAmount,
    chargingType: log.chargingType,
    batteryPercent: log.batteryPercent,
    efficiency: log.consumptionKmKwh,
    note: log.note,
  }));
  return [...fuelEntries, ...chargingEntries].sort((leftFeft: EnergyHistoryEntry, rightFeft: EnergyHistoryEntry) => {
    const tLeft = Date.parse(leftFeft.recordedAt);
    const tRight = Date.parse(rightFeft.recordedAt);
    return tRight - tLeft || leftFeft.id.localeCompare(rightFeft.id);
  });
}

export type ChargingLog = {
  id: string;
  vehicleId: string;
  recordedAt: string;
  odometerValue: number;
  kwh: number;
  totalAmount: number;
  batteryPercent: number | null;
  chargingType: ChargingType | null;
  consumptionKmKwh: number | null;
  note: string | null;
  createdAt: string;
};
export type ChargingInput = {
  odometerValue: string | number;
  kwh: string | number;
  totalAmount: string | number;
  batteryPercent?: string | number | null;
  chargingType?: ChargingType | null;
  recordedAt?: string;
  note?: string;
};
export type ChargingResults = { logs: ChargingLog[]; latest: ChargingLog | null; nextMinimum: number };
export type EnergyLoadResult = {
  fuel: { ok: true; data: FuelResults } | { ok: false; message: string };
  charging: { ok: true; data: ChargingResults } | { ok: false; message: string };
};

export interface CustomerJourneyFacade {
  listMaintenance?(vehicleId: string): Promise<{ data: MaintenanceRecord[] | null; error: RpcError }>;
  registerMaintenance?(vehicleId: string, input: MaintenanceInput): Promise<{ error: RpcError }>;
  registerExpense?(vehicleId: string, input: ExpenseInput): Promise<{ error: RpcError }>;
  refreshOnboarding(): Promise<{ data: unknown; error: RpcError }>;
  startOnboarding(displayName: string): Promise<{ error: RpcError }>;
  completeBasicProfile(displayName: string): Promise<{ error: RpcError }>;
  confirmVehicle(draft: VehicleDraft): Promise<{ error: RpcError }>;
  deactivateVehicle(vehicleId: string): Promise<{ error: RpcError }>;
  replaceVehicle(vehicleId: string, replacementVehicleId: string): Promise<{ error: RpcError }>;
  listVehicles(): Promise<{ data: GarageVehicle[] | null; error: RpcError }>;
  listServiceRequests?(): Promise<{ data: CustomerServiceRequest[] | null; error: RpcError }>;
  expenseForVehicle?(vehicleId: string, periodDays?: number | null): Promise<{ data: VehicleExpenseSummary | null; error: RpcError }>;
  registerMileage(vehicleId: string, input: MileageInput): Promise<{ data: MileageLog | null; error: RpcError }>;
  listMileage(vehicleId: string): Promise<{ data: MileageLog[] | null; error: RpcError }>;
  registerFuel(vehicleId: string, input: FuelInput): Promise<{ data: FuelLog | null; error: RpcError }>;
  listFuel(vehicleId: string): Promise<{ data: FuelLog[] | null; error: RpcError }>;
  registerCharging(vehicleId: string, input: ChargingInput): Promise<{ data: ChargingLog | null; error: RpcError }>;
  listCharging(vehicleId: string): Promise<{ data: ChargingLog[] | null; error: RpcError }>;
  listVehicleDocuments?(vehicleId: string): Promise<{ data: VehicleDocument[] | null; error: RpcError }>;
  registerVehicleDocument?(
    vehicleId: string,
    input: VehicleDocumentInput,
    bytes: Blob,
  ): Promise<{ ok: true; data: VehicleDocumentRegisterData } | { ok: false; message: string }>;
  removeVehicleDocument?(documentId: string): Promise<{ error: RpcError }>;
}

export type JourneyState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "basic-profile" }
  | { status: "vehicle" }
  | { status: "ready"; vehicles: GarageVehicle[]; requests: CustomerServiceRequest[]; expensesByVehicle: Record<string, VehicleExpenseSummary>; maintenanceByVehicle: Record<string, MaintenanceRecord[] | null> };

export interface CustomerJourneyController {
  registerMaintenance(vehicleId: string, input: MaintenanceInput): Promise<JourneyResult>;
  registerExpense(vehicleId: string, input: ExpenseInput): Promise<JourneyResult>;
  getState(): JourneyState;

  subscribe(listener: () => void): () => void;
  restore(): Promise<void>;
  submitBasicProfile(displayName: string, acceptedTerms: boolean): Promise<JourneyResult>;
  confirmVehicle(input: VehicleInput): Promise<JourneyResult>;
  deactivateVehicle(vehicleId: string): Promise<JourneyResult>;
  replaceVehicle(vehicleId: string, replacementVehicleId: string): Promise<JourneyResult>;
  refreshExpenses?(periodDays?: number | null): Promise<void>;
  registerMileage(vehicleId: string, input: MileageInput): Promise<JourneyResult>;
  listMileage(vehicleId: string): Promise<{ ok: true; data: MileageResults } | { ok: false; message: string }>;
  registerFuel(vehicleId: string, input: FuelInput): Promise<JourneyResult>;
  listFuel(vehicleId: string): Promise<{ ok: true; data: FuelResults } | { ok: false; message: string }>;
  registerCharging(vehicleId: string, input: ChargingInput): Promise<JourneyResult>;
  listCharging(vehicleId: string): Promise<{ ok: true; data: ChargingResults } | { ok: false; message: string }>;
  loadEnergy(vehicleId: string): Promise<EnergyLoadResult>;
  registerVehicleDocument(vehicleId: string, input: VehicleDocumentInput, bytes: Blob): Promise<JourneyResult>;
  listVehicleDocuments(vehicleId: string): Promise<{ ok: true; data: VehicleDocument[] } | { ok: false; message: string }>;
  removeVehicleDocument(documentId: string): Promise<JourneyResult>;
}

export function defaultDisplayName(user: JourneyUser) {
  const prefix = user.email?.split("@")[0]?.trim();
  return prefix || "Cliente VERAH";
}

const oldBrazilianPlate = /^[A-Z]{3}\d{4}$/;
const mercosulPlate = /^[A-Z]{3}\d[A-Z]\d{2}$/;
export function normalizeBrazilianPlate(value: string) {
  const normalized = value.trim().toUpperCase().replace(/[\s-]/g, "");
  return oldBrazilianPlate.test(normalized) || mercosulPlate.test(normalized) ? normalized : null;
}

export function prepareVehicleDraft(input: VehicleInput): { ok: true; draft: VehicleDraft } | { ok: false; message: string } {
  const plate = normalizeBrazilianPlate(input.plate);
  if (!plate) return { ok: false, message: "Placa inválida. Use o formato ABC1234 ou ABC1D23." };
  const brand = input.brand.trim();
  const model = input.model.trim();
  if (!brand || brand.length > 80 || !model || model.length > 80) return { ok: false, message: "Informe a marca e o modelo do veículo." };
  const modelYear = Number(input.modelYear);
  if (!Number.isInteger(modelYear) || modelYear < 1950 || modelYear > new Date().getFullYear() + 1) return { ok: false, message: "Informe um ano/modelo válido." };
  return { ok: true, draft: { plate, brand, model, modelYear, version: input.version?.trim() || null, engine: input.engine?.trim() || null, transmission: input.transmission?.trim() || null } };
}

export function sortMileageLogs(logs: MileageLog[]): MileageLog[] {
  return [...logs].sort((left, right) =>
    new Date(right.recordedAt).getTime() - new Date(left.recordedAt).getTime()
      || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

export function sortFuelLogs(logs: FuelLog[]): FuelLog[] {
  return [...logs].sort((left, right) =>
    new Date(right.recordedAt).getTime() - new Date(left.recordedAt).getTime()
      || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}
export function sortChargingLogs(logs: ChargingLog[]): ChargingLog[] {
  return [...logs].sort((left, right) =>
    new Date(right.recordedAt).getTime() - new Date(left.recordedAt).getTime()
      || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

type OnboardingSnapshot = { basicProfileCompleted: boolean; vehicleStatus: string };
function mapSnapshot(data: unknown): OnboardingSnapshot {
  const row = (data ?? {}) as Record<string, unknown>;
  return { basicProfileCompleted: row.basic_profile_completed === true, vehicleStatus: typeof row.vehicle_status === "string" ? row.vehicle_status : "pending" };
}

export function mapVehicleExpenseSummary(data: unknown): VehicleExpenseSummary | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  const numberField = (key: string): number | null => {
    const value = row[key];
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const totalCents = numberField("total_cents");
  if (totalCents === null) return null;
  return {
    totalCents,
    fuelCents: numberField("fuel_cents") ?? 0,
    maintenanceCents: numberField("maintenance_cents") ?? 0,
    otherCents: numberField("other_cents") ?? 0,
    expenseCount: numberField("expense_count") ?? 0,
    distanceKm: numberField("distance_km"),
    costPerKmCents: numberField("cost_per_km_cents"),
  };
}

export function formatBrzlCents(cents: number) {
  const reais = (cents ?? 0) / 100;
  return reais.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDistanceKm(km: number | null) {
  if (km === null) return "sem quilometragem válida";
  return `${Math.round(km).toLocaleString("pt-BR")} km`;
}

export function formatCostPerKm(cents: number | null) {
  if (cents === null) return "—";
  return `${formatBrzlCents(cents)}/km`;
}

export function createCustomerJourney(facade: CustomerJourneyFacade, user: JourneyUser): CustomerJourneyController {
  let state: JourneyState = { status: "loading" };
  let restoring: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const emit = () => { for (const listener of listeners) listener(); };
  const fail = (message: string) => { state = { status: "error", message }; emit(); };

  const loadHome = async () => {
    const [vehiclesResult, requestsResult] = await Promise.all([
      facade.listVehicles(),
      facade.listServiceRequests ? facade.listServiceRequests() : Promise.resolve({ data: [] as CustomerServiceRequest[], error: null }),
    ]);
    if (vehiclesResult.error) { fail(HOME_LOAD_UNAVAILABLE_MESSAGE); return false; }
    if (requestsResult.error) { fail(HOME_LOAD_UNAVAILABLE_MESSAGE); return false; }
    const vehicles = vehiclesResult.data ?? [];
    let expensesByVehicle: Record<string, VehicleExpenseSummary> = {};
    if (facade.expenseForVehicle) {
      const byVehicle: Record<string, VehicleExpenseSummary> = {};
      for (const vehicle of vehicles) {
        const result = await facade.expenseForVehicle(vehicle.id);
        if (result?.error) continue;
        const summary = mapVehicleExpenseSummary(result.data);
        if (summary !== null) byVehicle[vehicle.id] = summary;
      }
      expensesByVehicle = byVehicle;
    }
    const maintenanceByVehicle: Record<string, MaintenanceRecord[] | null> = {};
    await Promise.all(vehicles.map(async vehicle => {
      if (!facade.listMaintenance) { maintenanceByVehicle[vehicle.id] = null; return; }
      try {
        const result = await facade.listMaintenance(vehicle.id);
        maintenanceByVehicle[vehicle.id] = result.error ? null : (result.data ?? []);
      } catch { maintenanceByVehicle[vehicle.id] = null; }
    }));
    state = { status: "ready", vehicles, requests: requestsResult.data ?? [], expensesByVehicle, maintenanceByVehicle };
    emit();
    return true;
  };

  const routeFrom = (data: unknown) => {
    const snapshot = mapSnapshot(data);
    if (!snapshot.basicProfileCompleted) { state = { status: "basic-profile" }; emit(); return undefined; }
    if (snapshot.vehicleStatus !== "registered") { state = { status: "vehicle" }; emit(); return undefined; }
    return loadHome();
  };

  const restore = () => {
    restoring ??= (async () => {
      state = { status: "loading" }; emit();
      const first = await facade.refreshOnboarding();
      if (!first.error) { await routeFrom(first.data); return; }
      const started = await facade.startOnboarding(defaultDisplayName(user));
      if (started.error) { fail(started.error.message); return; }
      const second = await facade.refreshOnboarding();
      if (second.error) { fail(second.error.message); return; }
      await routeFrom(second.data);
    })().finally(() => { restoring = null; });
    return restoring;
  };

  void restore();
  return {
    getState: () => state,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    restore,
    async submitBasicProfile(displayName, acceptedTerms) {
      const name = displayName.trim();
      if (!name) return { ok: false, message: "Informe como podemos te chamar." };
      if (!acceptedTerms) return { ok: false, message: "É preciso aceitar os termos de onboarding do Pilot Alpha v1." };
      const { error } = await facade.completeBasicProfile(name);
      if (error) return { ok: false, message: error.message };
      const refreshed = await facade.refreshOnboarding();
      if (refreshed.error) return { ok: false, message: refreshed.error.message };
      await routeFrom(refreshed.data);
      return { ok: true };
    },
    async confirmVehicle(input) {
      const prepared = prepareVehicleDraft(input);
      if (!prepared.ok) return prepared;
      const { error } = await facade.confirmVehicle(prepared.draft);
      if (error) return { ok: false, message: error.message };
      const loaded = await loadHome();
      return loaded ? { ok: true } : { ok: false, message: "Veículo salvo, mas não foi possível carregar a sua área VERAH." };
    },
    async deactivateVehicle(vehicleId) {
      const { error } = await facade.deactivateVehicle(vehicleId);
      if (error) return { ok: false, message: error.message };
      const loaded = await loadHome();
      return loaded ? { ok: true } : { ok: false, message: "Veículo removido, mas não foi possível atualizar sua garagem." };
    },
    async replaceVehicle(vehicleId, replacementVehicleId) {
      const { error } = await facade.replaceVehicle(vehicleId, replacementVehicleId);
      if (error) return { ok: false, message: error.message };
      const loaded = await loadHome();
      return loaded ? { ok: true } : { ok: false, message: "Veículo substituído, mas não foi possível atualizar sua garagem." };
    },
    async registerMaintenance(vehicleId, input) {
      if (!facade.registerMaintenance) return { ok: false, message: "Manutenções indisponíveis." };
      try {
        const result = await facade.registerMaintenance(vehicleId, input);
        if (result.error) return { ok: false, message: result.error.message };
        return { ok: true };
      } catch { return { ok: false, message: "Falha de conexão. Tente novamente com os mesmos dados." }; }
    },
    async registerExpense(vehicleId, input) {
      if (!facade.registerExpense) return { ok: false, message: "Despesas indisponíveis." };
      if (!mapExpenseCategory(input.category)) return { ok: false, message: "Selecione uma categoria válida." };
      const amount = Number(input.amountCents);
      if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 2_147_483_647) {
        return { ok: false, message: "Informe um valor acima de zero." };
      }
      const date = String(input.occurredOn);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))) {
        return { ok: false, message: "Informe uma data válida." };
      }
      if (date > new Date().toISOString().slice(0, 10)) {
        return { ok: false, message: "Informe uma data até hoje." };
      }
      const odometer = input.odometerKm === undefined || input.odometerKm === null || input.odometerKm === 0
        ? null
        : Number(input.odometerKm);
      if (odometer !== null && (!Number.isInteger(odometer) || odometer < 0 || odometer > 2000000)) {
        return { ok: false, message: "Informe uma quilometragem válida." };
      }
      const description = input.description?.trim() || null;
      if (description && description.length > 160) {
        return { ok: false, message: "Descrição muito longa (limite de 160 caracteres)." };
      }
      const result = await facade.registerExpense(vehicleId, {
        category: input.category,
        amountCents: amount,
        occurredOn: date,
        odometerKm: odometer,
        description,
      });
      if (result.error) return { ok: false, message: result.error.message };
      if (state.status === "ready" && facade.expenseForVehicle) {
        const summaryResult = await facade.expenseForVehicle(vehicleId, null);
        if (!summaryResult.error && summaryResult.data) {
          state = { ...state, expensesByVehicle: { ...state.expensesByVehicle, [vehicleId]: mapVehicleExpenseSummary(summaryResult.data) ?? state.expensesByVehicle[vehicleId] } };
          emit();
        }
      }
      return { ok: true };
    },
    async registerMileage(vehicleId, input) {
      const value = Number(input.mileageValue);
      if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
        return { ok: false, message: "Informe a quilometragem atual do veículo." };
      }
      if (value > 2000000) {
        return { ok: false, message: "Quilometragem acima do limite suportado." };
      }
      const trimmedNote = input.note?.trim() || null;
      if (trimmedNote && trimmedNote.length > 200) {
        return { ok: false, message: "Observação muito longa(limite de 200 caracteres." };
      }
      const result = await facade.registerMileage(vehicleId, {
        mileageValue: value,
        recordedAt: input.recordedAt ?? new Date().toISOString(),
        note: trimmedNote ?? undefined,
      });
      if (result.error) return { ok: false, message: result.error.message };
      return { ok: true };
    },
    async listMileage(vehicleId) {
      const result = await facade.listMileage(vehicleId);
      if (result.error) return { ok: false, message: result.error.message };
      const logs = sortMileageLogs(result.data ?? []);
      const latest = logs[0] ?? null;
      const nextMinimum = latest ? latest.mileageValue : 0;
      return { ok: true, data: { logs, latest, nextMinimum } };
    },
    async registerFuel(vehicleId, input) {
      const odometer = Number(input.odometerValue);
      if (!Number.isFinite(odometer) || !Number.isInteger(odometer) || odometer < 0) {
        return { ok: false, message: "Informe o hodômetro atual do veículo." };
      }
      if (odometer > 2000000) {
        return { ok: false, message: "Quilometragem acima do limite suportado." };
      }
      const liters = Number(input.liters);
      if (!Number.isFinite(liters) || liters <=  0 || liters >  10000) {
        return { ok: false, message: "Informe a quantidade de litros abastecida." };
      }
      const totalAmount = Number(input.totalAmount);
      if (!Number.isFinite(totalAmount) || totalAmount <  0) {
        return { ok: false, message: "Informe o valor total do abastecimento." };
      }
      if (!FUEL_TYPES.includes(input.fuelType)) {
        return { ok: false, message: "Selecione um combustível válido." };
      }
      const trimmedNote = input.note?.trim() || null;
      if (trimmedNote && trimmedNote.length > 200) {
        return { ok: false, message: "Observação muito longa(limite de 200 caracteres." };
      }
      const result = await facade.registerFuel(vehicleId, {
        odometerValue: odometer,
        liters,
        totalAmount,
        fuelType: input.fuelType,
        recordedAt: input.recordedAt ?? new Date().toISOString(),
        note: trimmedNote ?? undefined,
      });
      if (result.error) return { ok: false, message: result.error.message };
      return { ok: true };
    },
    async listFuel(vehicleId) {
      const result = await facade.listFuel(vehicleId);
      if (result.error) {
        console.warn("[verah-mobile] fuel history unavailable:", result.error.message);
        return { ok: false, message: FUEL_UNAVAILABLE_MESSAGE };
      }
      const logs = sortFuelLogs(result.data ?? []);
      const latest = logs[0] ?? null;
      const nextMinimum = latest ? latest.odometerValue : 0;
      return { ok: true, data: { logs, latest, nextMinimum } };
    },
    async registerCharging(vehicleId, input) {
      const odometer = Number(input.odometerValue);
      if (!Number.isFinite(odometer) || !Number.isInteger(odometer) || odometer < 0) {
        return { ok: false, message: "Informe o hodômetro atual do veículo." };
      }
      if (odometer > 2000000) {
        return { ok: false, message: "Quilometragem acima do limite suportado." };
      }
      const kwh = Number(input.kwh);
      if (!Number.isFinite(kwh) || kwh <=  0 || kwh >  10000) {
        return { ok: false, message: "Informe a quantidade de energia (kWh) da recarga." };
      }
      const totalAmount = Number(input.totalAmount);
      if (!Number.isFinite(totalAmount) || totalAmount <  0) {
        return { ok: false, message: "Informe o valor total da recarga." };
      }
      let batteryPercent: number | null = null;
      if (input.batteryPercent !== undefined && input.batteryPercent !== null && String(input.batteryPercent).trim() !== "") {
        batteryPercent = Number(input.batteryPercent);
        if (!Number.isFinite(batteryPercent) || batteryPercent <  0 || batteryPercent >  100) {
          return { ok: false, message: "Informe um percentual de bateria entre 0 e 100." };
        }
      }
      let chargingType: ChargingType | null = null;
      if (input.chargingType !== undefined && input.chargingType !== null) {
        if (!CHARGING_TYPES.includes(input.chargingType)) {
          return { ok: false, message: "Selecione um tipo de recarga válido." };
        }
        chargingType = input.chargingType;
      }
      const trimmedNote = input.note?.trim() || null;
      if (trimmedNote && trimmedNote.length > 200) {
        return { ok: false, message: "Observação muito longa(limite de 200 caracteres." };
      }
      const result = await facade.registerCharging(vehicleId, {
        odometerValue: odometer,
        kwh,
        totalAmount,
        batteryPercent,
        chargingType,
        recordedAt: input.recordedAt ?? new Date().toISOString(),
        note: trimmedNote ?? undefined,
      });
      if (result.error) return { ok: false, message: result.error.message };
      return { ok: true };
    },
    async listCharging(vehicleId) {
      const result = await facade.listCharging(vehicleId);
      if (result.error) {
        console.warn("[verah-mobile] charging history unavailable:", result.error.message);
        return { ok: false, message: CHARGING_UNAVAILABLE_MESSAGE };
      }
      const logs = sortChargingLogs(result.data ?? []);
      const latest = logs[0] ?? null;
      const nextMinimum = latest ? latest.odometerValue : 0;
      return { ok: true, data: { logs, latest, nextMinimum } };
    },
    async loadEnergy(vehicleId) {
      const [fuel, charging] = await Promise.all([
        this.listFuel(vehicleId),
        this.listCharging(vehicleId),
      ]);
      return { fuel, charging };
    },
    async registerVehicleDocument(vehicleId, input, bytes) {
      if (!facade.registerVehicleDocument) return { ok: false, message: "Documentos indisponíveis." };
      try {
        const result = await facade.registerVehicleDocument(vehicleId, input, bytes);
        return result.ok ? { ok: true } : { ok: false, message: result.message };
      } catch {
        return { ok: false, message: "Falha de conexão. Tente novamente com os mesmos dados." };
      }
    },
    async listVehicleDocuments(vehicleId) {
      const result = await facade.listVehicleDocuments?.(vehicleId);
      if (!result || result.error) return { ok: false, message: result?.error?.message ?? "Documentos indisponíveis." };
      const documents = sortVehicleDocuments((result.data ?? []).filter((document) => document.status === "active"));
      return { ok: true, data: documents };
    },
    async removeVehicleDocument(documentId) {
      if (!facade.removeVehicleDocument) return { ok: false, message: "Documentos indisponíveis." };
      const result = await facade.removeVehicleDocument(documentId);
      if (result.error) return { ok: false, message: result.error.message };
      return { ok: true };
    },
    async refreshExpenses(periodDays?: number | null) {
      if (state.status !== "ready") return;
      if (!facade.expenseForVehicle) return;
      const byVehicle: Record<string, VehicleExpenseSummary> = {};
      for (const vehicle of state.vehicles) {
        const result = await facade.expenseForVehicle(vehicle.id, periodDays ?? null);
        if (result?.error) continue;
        const summary = mapVehicleExpenseSummary(result.data);
        if (summary !== null) byVehicle[vehicle.id] = summary;
      }
      state = { ...state, expensesByVehicle: byVehicle };
      emit();
    },
  };
}
