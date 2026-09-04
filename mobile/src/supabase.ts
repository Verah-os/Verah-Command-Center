import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveSupabaseConfig } from "./config";
import type { AuthFacade } from "./auth-session";
import {
  ONBOARDING_TERMS_VERSION,
  type CustomerJourneyFacade,
  type CustomerServiceRequest,
  type GarageVehicle,
} from "./customer-journey";

let cached: SupabaseClient | null = null;
let cachedFacade: AuthFacade | null = null;
let cachedJourneyFacade: CustomerJourneyFacade | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (cached) return cached;
  const config = resolveSupabaseConfig({
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  });
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
    listServiceRequests: async () => {
      const {
        data: { user },
      } = await client.auth.getUser();
      if (!user) return { data: [], error: { message: "Sessão expirada." } };
      const { data, error } = await client
        .from("service_requests")
        .select(
          "id,reference_code,vehicle_brand,vehicle_model,service_stage,copilot_customer_message,probable_category,completed_at,customer_rating,created_at",
        )
        .eq("created_by", user.id)
        .order("created_at", { ascending: false });
      const mapped = (data ?? []).map((row) => ({
        id: row.id as string,
        referenceCode: row.reference_code as string,
        vehicleBrand: row.vehicle_brand as string,
        vehicleModel: row.vehicle_model as string,
        serviceStage: row.service_stage as string,
        customerMessage: (row.copilot_customer_message as string | null) ?? null,
        probableCategory: (row.probable_category as string | null) ?? null,
        completedAt: (row.completed_at as string | null) ?? null,
        customerRating:
          row.customer_rating === null ? null : Number(row.customer_rating),
        createdAt: row.created_at as string,
      })) as CustomerServiceRequest[];
      return { data: mapped, error: error ?? null };
    },
  };
  return cachedJourneyFacade;
}
