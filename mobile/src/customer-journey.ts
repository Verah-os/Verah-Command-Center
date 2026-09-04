export const ONBOARDING_TERMS_VERSION = "pilot-alpha-onboarding-v1";

export type JourneyUser = { id: string; email?: string };
export type GarageVehicle = { id: string; brand: string; model: string; year: number | null; plate: string | null; nickname: string | null };
export type CustomerServiceRequest = { id: string; referenceCode: string; vehicleBrand: string; vehicleModel: string; serviceStage: string; customerMessage: string | null; probableCategory: string | null; completedAt: string | null; customerRating: number | null; createdAt: string };
export type VehicleDraft = { plate: string; brand: string; model: string; modelYear: number; version: string | null; engine: string | null; transmission: string | null };
export type VehicleInput = { plate: string; brand: string; model: string; modelYear: string | number; version?: string; engine?: string; transmission?: string };
export type JourneyResult = { ok: true } | { ok: false; message: string };
type RpcError = { message: string } | null;

export interface CustomerJourneyFacade {
  refreshOnboarding(): Promise<{ data: unknown; error: RpcError }>;
  startOnboarding(displayName: string): Promise<{ error: RpcError }>;
  completeBasicProfile(displayName: string): Promise<{ error: RpcError }>;
  confirmVehicle(draft: VehicleDraft): Promise<{ error: RpcError }>;
  listVehicles(): Promise<{ data: GarageVehicle[] | null; error: RpcError }>;
  listServiceRequests?(): Promise<{ data: CustomerServiceRequest[] | null; error: RpcError }>;
}

export type JourneyState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "basic-profile" }
  | { status: "vehicle" }
  | { status: "ready"; vehicles: GarageVehicle[]; requests: CustomerServiceRequest[] };

export interface CustomerJourneyController {
  getState(): JourneyState;
  subscribe(listener: () => void): () => void;
  restore(): Promise<void>;
  submitBasicProfile(displayName: string, acceptedTerms: boolean): Promise<JourneyResult>;
  confirmVehicle(input: VehicleInput): Promise<JourneyResult>;
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

type OnboardingSnapshot = { basicProfileCompleted: boolean; vehicleStatus: string };
function mapSnapshot(data: unknown): OnboardingSnapshot {
  const row = (data ?? {}) as Record<string, unknown>;
  return { basicProfileCompleted: row.basic_profile_completed === true, vehicleStatus: typeof row.vehicle_status === "string" ? row.vehicle_status : "pending" };
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
    if (vehiclesResult.error) { fail(vehiclesResult.error.message); return false; }
    if (requestsResult.error) { fail(requestsResult.error.message); return false; }
    state = { status: "ready", vehicles: vehiclesResult.data ?? [], requests: requestsResult.data ?? [] };
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
  };
}
