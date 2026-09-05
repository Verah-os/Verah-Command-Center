import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Linking } from "react-native";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { resolveSupabaseConfig } from "./config";
import type { AuthFacade, AuthUser } from "./auth-session";
import {
  ONBOARDING_TERMS_VERSION,
  type CustomerJourneyFacade,
  type CustomerServiceRequest,
  type GarageVehicle,
} from "./customer-journey";

let cached: SupabaseClient | null = null;
let cachedFacade: AuthFacade | null = null;
let cachedJourneyFacade: CustomerJourneyFacade | null = null;

const customerTrackingSelect =
  "id,reference_code,vehicle_brand,vehicle_model,vehicle_year,city,state,service_stage,customer_report,copilot_customer_message,probable_category,copilot_summary,perceived_urgency,concierge_accepted_at,provider_assigned_at,completed_at,completion_notes,customer_rating,created_at";

function nullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email,
    userMetadata: user.user_metadata as Record<string, unknown>,
    appMetadata: user.app_metadata as Record<string, unknown>,
    createdAt: user.created_at,
    lastSignInAt: user.last_sign_in_at,
  };
}

function mapServiceRequest(row: Record<string, unknown>): CustomerServiceRequest {
  return {
    id: row.id as string,
    referenceCode: row.reference_code as string,
    vehicleBrand: row.vehicle_brand as string,
    vehicleModel: row.vehicle_model as string,
    vehicleYear:
      row.vehicle_year === null || row.vehicle_year === undefined
        ? null
        : Number(row.vehicle_year),
    city: nullableString(row.city),
    state: nullableString(row.state),
    serviceStage: row.service_stage as string,
    customerReport: nullableString(row.customer_report),
    customerMessage: nullableString(row.copilot_customer_message),
    probableCategory: nullableString(row.probable_category),
    copilotSummary: nullableString(row.copilot_summary),
    perceivedUrgency: nullableString(row.perceived_urgency),
    conciergeAcceptedAt: nullableString(row.concierge_accepted_at),
    providerAssignedAt: nullableString(row.provider_assigned_at),
    completedAt: nullableString(row.completed_at),
    completionNotes: nullableString(row.completion_notes),
    customerRating:
      row.customer_rating === null || row.customer_rating === undefined
        ? null
        : Number(row.customer_rating),
    createdAt: row.created_at as string,
  };
}

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
      return {
        session: data.session ? { user: toAuthUser(data.session.user) } : null,
      };
    },
    onAuthStateChange: (listener) => {
      const { data } = auth.onAuthStateChange((event, session) =>
        listener(event, session ? { user: toAuthUser(session.user) } : null),
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
    signInWithGoogle: async () => {
      const { data, error } = await auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: "verah-dev://auth/callback",
          skipBrowserRedirect: true,
        },
      });
      if (error) return { error };
      if (!data.url) return { error: { message: "O Google não retornou uma URL de autenticação." } };
      try {
        await Linking.openURL(data.url);
        return { error: null };
      } catch {
        return { error: { message: "Não foi possível abrir o login do Google." } };
      }
    },
    handleAuthUrl: async (url) => {
      if (!url.startsWith("verah-dev://auth/callback")) return { error: null };
      const parsed = new URL(url);
      const code = parsed.searchParams.get("code");
      if (code) {
        const { error } = await auth.exchangeCodeForSession(code);
        return { error: error ?? null };
      }
      const hash = url.includes("#") ? url.slice(url.indexOf("#") + 1) : "";
      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      if (accessToken && refreshToken) {
        const { error } = await auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        return { error: error ?? null };
      }
      return { error: { message: "Retorno do Google sem sessão válida." } };
    },
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
        .select(customerTrackingSelect)
        .eq("created_by", user.id)
        .order("created_at", { ascending: false });
      const mapped = (data ?? []).map((row) =>
        mapServiceRequest(row as Record<string, unknown>),
      );
      return { data: mapped, error: error ?? null };
    },
  };
  return cachedJourneyFacade;
}
