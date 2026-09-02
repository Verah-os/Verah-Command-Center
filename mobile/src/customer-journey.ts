// Pure customer journey state machine for the mobile M1 flow (#173): basic
// profile onboarding -> vehicle confirmation -> persisted garage. Free of
// React Native imports so it runs under plain `node --test` (same convention
// as the root suite); the Supabase RPC/PostgREST binding lives in
// `supabase.ts`. Reuses the canonical #139 contract only:
// start_customer_onboarding / complete_customer_basic_onboarding /
// refresh_customer_onboarding / confirm_customer_vehicle + customer_vehicles
// reads under owner-based RLS. No parallel backend, no direct insert.

export const ONBOARDING_TERMS_VERSION = "pilot-alpha-onboarding-v1";

export type JourneyUser = { id: string; email?: string };

export type GarageVehicle = {
  id: string;
  brand: string;
  model: string;
  year: number | null;
  plate: string | null;
  nickname: string | null;
};

export type VehicleDraft = {
  plate: string;
  brand: string;
  model: string;
  modelYear: number;
  version: string | null;
  engine: string | null;
  transmission: string | null;
};

export type VehicleInput = {
  plate: string;
  brand: string;
  model: string;
  modelYear: string | number;
  version?: string;
  engine?: string;
  transmission?: string;
};

export type JourneyResult = { ok: true } | { ok: false; message: string };

type RpcError = { message: string } | null;

// Minimal seam over the Supabase surface used by the journey. Injection via
// this interface is required for tests (Node CI has no RN runtime); the real
// binding from SupabaseClient lives in `supabase.ts`.
export interface CustomerJourneyFacade {
  refreshOnboarding(): Promise<{ data: unknown; error: RpcError }>;
  startOnboarding(displayName: string): Promise<{ error: RpcError }>;
  completeBasicProfile(displayName: string): Promise<{ error: RpcError }>;
  confirmVehicle(draft: VehicleDraft): Promise<{ error: RpcError }>;
  listVehicles(): Promise<{ data: GarageVehicle[] | null; error: RpcError }>;
}

export type JourneyState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "basic-profile" }
  | { status: "vehicle" }
  | { status: "ready"; vehicles: GarageVehicle[] };

export interface CustomerJourneyController {
  getState(): JourneyState;
  subscribe(listener: () => void): () => void;
  restore(): Promise<void>;
  submitBasicProfile(
    displayName: string,
    acceptedTerms: boolean,
  ): Promise<JourneyResult>;
  confirmVehicle(input: VehicleInput): Promise<JourneyResult>;
}

export function defaultDisplayName(user: JourneyUser) {
  const prefix = user.email?.split("@")[0]?.trim();
  return prefix || "Cliente VERAH";
}

// Canonical Brazilian plate formats, mirrored from
// services/customer-vehicles/onboarding.ts (#139). Mobile keeps its own copy
// because the workspace tsconfig excludes the web app sources.
const oldBrazilianPlate = /^[A-Z]{3}\d{4}$/;
const mercosulPlate = /^[A-Z]{3}\d[A-Z]\d{2}$/;

export function normalizeBrazilianPlate(value: string) {
  const normalized = value.trim().toUpperCase().replace(/[\s-]/g, "");
  return oldBrazilianPlate.test(normalized) || mercosulPlate.test(normalized)
    ? normalized
    : null;
}

// Local pre-validation mirroring prepareManualVehicle + the RPC checks, so
// obvious mistakes never reach the backend.
export function prepareVehicleDraft(
  input: VehicleInput,
): { ok: true; draft: VehicleDraft } | { ok: false; message: string } {
  const plate = normalizeBrazilianPlate(input.plate);
  if (!plate) {
    return { ok: false, message: "Placa inválida. Use o formato ABC1234 ou ABC1D23." };
  }
  const brand = input.brand.trim();
  const model = input.model.trim();
  if (!brand || brand.length > 80 || !model || model.length > 80) {
    return { ok: false, message: "Informe a marca e o modelo do veículo." };
  }
  const modelYear = Number(input.modelYear);
  if (
    !Number.isInteger(modelYear) ||
    modelYear < 1950 ||
    modelYear > new Date().getFullYear() + 1
  ) {
    return { ok: false, message: "Informe um ano/modelo válido." };
  }
  return {
    ok: true,
    draft: {
      plate,
      brand,
      model,
      modelYear,
      version: input.version?.trim() || null,
      engine: input.engine?.trim() || null,
      transmission: input.transmission?.trim() || null,
    },
  };
}

type OnboardingSnapshot = {
  basicProfileCompleted: boolean;
  vehicleStatus: string;
};

function mapSnapshot(data: unknown): OnboardingSnapshot {
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    basicProfileCompleted: row.basic_profile_completed === true,
    vehicleStatus:
      typeof row.vehicle_status === "string" ? row.vehicle_status : "pending",
  };
}

export function createCustomerJourney(
  facade: CustomerJourneyFacade,
  user: JourneyUser,
): CustomerJourneyController {
  let state: JourneyState = { status: "loading" };
  let restoring: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const fail = (message: string) => {
    state = { status: "error", message };
    emit();
  };

  const loadGarage = async () => {
    const { data, error } = await facade.listVehicles();
    if (error) {
      fail(error.message);
      return false;
    }
    state = { status: "ready", vehicles: data ?? [] };
    emit();
    return true;
  };

  const routeFrom = (data: unknown) => {
    const snapshot = mapSnapshot(data);
    if (!snapshot.basicProfileCompleted) {
      state = { status: "basic-profile" };
      emit();
      return undefined;
    }
    if (snapshot.vehicleStatus !== "registered") {
      state = { status: "vehicle" };
      emit();
      return undefined;
    }
    return loadGarage();
  };

  const restore = () => {
    restoring ??= (async () => {
      state = { status: "loading" };
      emit();
      const first = await facade.refreshOnboarding();
      if (!first.error) {
        await routeFrom(first.data);
        return;
      }
      // Fresh mobile sign-up has no customer identity yet: bootstrap it once
      // (idempotent RPC, same call the web sign-up makes), then re-read.
      const started = await facade.startOnboarding(defaultDisplayName(user));
      if (started.error) {
        fail(started.error.message);
        return;
      }
      const second = await facade.refreshOnboarding();
      if (second.error) {
        fail(second.error.message);
        return;
      }
      await routeFrom(second.data);
    })().finally(() => {
      restoring = null;
    });
    return restoring;
  };

  void restore();

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    restore,
    async submitBasicProfile(displayName, acceptedTerms) {
      const name = displayName.trim();
      if (!name) {
        return { ok: false, message: "Informe como podemos te chamar." };
      }
      if (!acceptedTerms) {
        return {
          ok: false,
          message: "É preciso aceitar os termos de onboarding do Pilot Alpha v1.",
        };
      }
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
      // confirm_customer_vehicle already refreshes onboarding server-side;
      // the garage read under RLS is the customer-facing confirmation.
      const loaded = await loadGarage();
      return loaded
        ? { ok: true }
        : { ok: false, message: "Veículo salvo, mas não foi possível carregar a garagem." };
    },
  };
}
