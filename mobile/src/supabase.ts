import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveSupabaseConfig } from "./config";
import type { AuthFacade } from "./auth-session";
import {
  ONBOARDING_TERMS_VERSION,
  type CustomerJourneyFacade,
  type GarageVehicle,
} from "./customer-journey";

let cached: SupabaseClient | null = null;
let cachedFacade: AuthFacade | null = null;
let cachedJourneyFacade: CustomerJourneyFacade | null = null;

// Same Supabase project as the Command Center: anon key + RLS + RPCs.
// No parallel backend, no server-side secrets in the app.
export function getSupabaseClient(): SupabaseClient | null {
  if (cached) return cached;
  const config = resolveSupabaseConfig(process.env);
  if (!config) return null;
  cached = createClient(config.url, config.anonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  return cached;
}

// Real binding from SupabaseClient to the pure auth facade consumed by the
// session state machine. Returns null when fail-closed (no public config).
export function getAuthFacade(): AuthFacade | null {
  if (cachedFacade) return cachedFacade;
  const client = getSupabaseClient();
  if (!client) return null;
  const { auth } = client;
  cachedFacade = {
    getSession: async () => {
      const { data } = await auth.getSession();
      return { session: data.session };
    },
    onAuthStateChange: (listener) => {
      const { data } = auth.onAuthStateChange((event, session) =>
        listener(event, session),
      );
      return data.subscription;
    },
    signIn: (email, password) =>
      auth
        .signInWithPassword({ email, password })
        .then(({ error }) => ({ error: error ?? null })),
    signUp: (email, password) =>
      auth.signUp({ email, password }).then(({ error }) => ({ error: error ?? null })),
    signOut: () => auth.signOut().then(({ error }) => ({ error: error ?? null })),
  };
  return cachedFacade;
}

// Real binding from SupabaseClient to the pure customer journey consumed by
// the onboarding/garage state machine. Canonical #139 contract only: the
// onboarding RPCs + confirm_customer_vehicle (vehicle creation is RPC-only;
// direct insert is revoked from authenticated) + customer_vehicles reads
// under owner-based RLS. Manual provenance: mobile has no lookup fixture,
// so every confirmation is customer-entered data with explicit confirmation.
// Returns null when fail-closed (no public config).
export function getCustomerJourneyFacade(): CustomerJourneyFacade | null {
  if (cachedJourneyFacade) return cachedJourneyFacade;
  const client = getSupabaseClient();
  if (!client) return null;
  cachedJourneyFacade = {
    refreshOnboarding: async () => {
      const { data, error } = await client.rpc("refresh_customer_onboarding");
      return { data, error: error ?? null };
    },
    startOnboarding: async (displayName) => {
      const { error } = await client.rpc("start_customer_onboarding", {
        p_display_name: displayName,
      });
      return { error: error ?? null };
    },
    completeBasicProfile: async (displayName) => {
      const { error } = await client.rpc("complete_customer_basic_onboarding", {
        p_display_name: displayName,
        p_terms_version: ONBOARDING_TERMS_VERSION,
      });
      return { error: error ?? null };
    },
    confirmVehicle: async (draft) => {
      const { error } = await client.rpc("confirm_customer_vehicle", {
        p_plate: draft.plate,
        p_brand: draft.brand,
        p_model: draft.model,
        p_model_year: draft.modelYear,
        p_version: draft.version,
        p_engine_type: draft.engine,
        p_transmission: draft.transmission,
        p_lookup_source: "manual",
        p_customer_confirmed: true,
      });
      return { error: error ?? null };
    },
    listVehicles: async () => {
      const { data, error } = await client
        .from("customer_vehicles")
        .select("id,brand,model,year,plate,nickname")
        .eq("active", true)
        .order("created_at", { ascending: true });
      return {
        data: (data as GarageVehicle[] | null) ?? null,
        error: error ?? null,
      };
    },
  };
  return cachedJourneyFacade;
}
