import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Linking } from "react-native";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { resolveSupabaseConfig } from "./config";
import type { AuthFacade, AuthUser } from "./auth-session";
import type { MaintenanceRecord } from "./maintenance";
import {
  registerVehicleDocumentSafely,
  type VehicleDocument,
  type VehicleDocumentInput,
  type VehicleDocumentMimeType,
  type VehicleDocumentRegisterData,
} from "./vehicle-documents.ts";
import {
  ONBOARDING_TERMS_VERSION,
  type ChargingInput,
  type ExpenseInput,
  type ChargingLog,
  type ChargingType,
  type CustomerJourneyFacade,
  type CustomerServiceRequest,
  type FuelInput,
  type FuelLog,
  type FuelType,
  type GarageVehicle,
  type MileageInput,
  type MileageLog,
  type VehicleExpenseSummary,
} from "./customer-journey";

let cached: SupabaseClient | null = null;
let cachedFacade: AuthFacade | null = null;
let cachedJourneyFacade: CustomerJourneyFacade | null = null;

const customerTrackingSelect =
  "id,reference_code,vehicle_brand,vehicle_model,vehicle_year,city,state,service_stage,customer_report,copilot_customer_message,probable_category,copilot_summary,perceived_urgency,concierge_accepted_at,provider_assigned_at,completed_at,completion_notes,customer_rating,created_at";

function nullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function toDayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
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

function mapMileageLog(row: Record<string, unknown>): MileageLog {
  return {
    id: row.id as string,
    vehicleId: row.vehicle_id as string,
    recordedAt: row.recorded_at as string,
    mileageValue: Number(row.mileage_value),
    note: nullableString(row.note),
    createdAt: row.created_at as string,
  };
}

function mapFuelLog(row: Record<string, unknown>): FuelLog {
  return {
    id: row.id as string,
    vehicleId: row.vehicle_id as string,
    recordedAt: row.recorded_at as string,
    odometerValue: Number(row.odometer_value),
    liters: Number(row.liters),
    totalAmount: Number(row.total_amount),
    fuelType: row.fuel_type as FuelType,
    consumptionKmpl:
      row.consumption_kmpl === null || row.consumption_kmpl === undefined
        ? null
        : Number(row.consumption_kmpl),
    note: nullableString(row.note),
    createdAt: row.created_at as string,
  };
}

function mapChargingLog(row: Record<string, unknown>): ChargingLog {
  return {
    id: row.id as string,
    vehicleId: row.vehicle_id as string,
    recordedAt: row.recorded_at as string,
    odometerValue: Number(row.odometer_value),
    kwh: Number(row.kwh),
    totalAmount: Number(row.total_amount),
    batteryPercent:
      row.battery_percent === null || row.battery_percent === undefined
        ? null
        : Number(row.battery_percent),
    chargingType:
      row.charging_type === null || row.charging_type === undefined
        ? null
        : (row.charging_type as ChargingType),
    consumptionKmKwh:
      row.consumption_km_kwh === null || row.consumption_km_kwh === undefined
        ? null
        : Number(row.consumption_km_kwh),
    note: nullableString(row.note),
    createdAt: row.created_at as string,
  };
}

function mapVehicleDocument(row: Record<string, unknown>): VehicleDocument {
  return {
    id: row.id as string,
    vehicleId: row.vehicle_id as string,
    documentKind: row.document_kind as VehicleDocument["documentKind"],
    documentDate: row.document_date as string,
    reference: nullableString(row.reference),
    note: nullableString(row.note),
    fileName: row.file_name as string,
    mimeType: row.mime_type as VehicleDocument["mimeType"],
    sizeBytes: Number(row.size_bytes),
    storageBucket: row.storage_bucket as string,
    storagePath: row.storage_path as string,
    status: row.status as VehicleDocument["status"],
    createdAt: row.created_at as string,
  };
}

const vehicleDocumentSelect =
  "id,vehicle_id,document_kind,document_date,reference,note,file_name,mime_type,size_bytes,storage_bucket,storage_path,status,created_at";

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
    listMaintenance: async (vehicleId) => {
      const { data, error } = await client.from("vehicle_maintenance_records")
        .select("id,vehicle_id,maintenance_type,description,occurred_on,odometer_km,amount_cents,next_due_on,next_due_km")
        .eq("vehicle_id", vehicleId).order("occurred_on", { ascending: false });
      return { data: data as MaintenanceRecord[] | null, error: error ?? null };
    },
    registerMaintenance: async (vehicleId, input) => {
      const { error } = await client.rpc("register_vehicle_maintenance", {
        p_vehicle_id: vehicleId, p_maintenance_type: input.maintenance_type,
        p_description: input.description, p_occurred_on: input.occurred_on,
        p_odometer_km: input.odometer_km, p_amount_cents: input.amount_cents,
        p_next_due_on: input.next_due_on, p_next_due_km: input.next_due_km,
        p_create_expense: input.create_expense, p_idempotency_key: input.idempotency_key,
      });
      return { error: error ?? null };
    },
    registerExpense: async (vehicleId, input) => {
      const {
        data: { user },
      } = await client.auth.getUser();
      if (!user) return { error: { message: "Sessão expirada. Entre novamente para registrar despesas." } };
      const { data: vehicle, error: vehicleError } = await client
        .from("customer_vehicles")
        .select("id,owner_id,customer_id,active")
        .eq("id", vehicleId)
        .eq("owner_id", user.id)
        .eq("active", true)
        .maybeSingle();
      if (vehicleError || !vehicle) {
        return { error: { message: "Veículo não encontrado." } };
      }
      const row = vehicle as Record<string, unknown>;
      const { error } = await client.from("vehicle_expenses").insert({
        owner_id: user.id,
        customer_id: row.customer_id as string,
        vehicle_id: vehicleId,
        category: input.category,
        description: input.description ?? null,
        amount_cents: input.amountCents,
        occurred_on: input.occurredOn,
        odometer_km: input.odometerKm ?? null,
      });
      return { error: error ?? null };
    },
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
    deactivateVehicle: async (vehicleId) => {
      const { error } = await client.rpc("replace_customer_vehicle", {
        p_vehicle_id: vehicleId,
        p_replacement_vehicle_id: null,
        p_customer_confirmed: true,
      });
      return { error: error ?? null };
    },
    replaceVehicle: async (vehicleId, replacementVehicleId) => {
      const { error } = await client.rpc("replace_customer_vehicle", {
        p_vehicle_id: vehicleId,
        p_replacement_vehicle_id: replacementVehicleId,
        p_customer_confirmed: true,
      });
      return { error: error ?? null };
    },
    listVehicles: async () => {
      const { data, error } = await client
        .from("customer_vehicles")
        .select("id,brand,model,year,plate,nickname,current_mileage")
        .eq("active", true)
        .order("created_at", { ascending: true });
      const mapped = (data ?? []).map((row) => {
        const vehicle = row as Record<string, unknown>;
        const currentMileage =
          vehicle.current_mileage === null || vehicle.current_mileage === undefined
            ? null
            : Number(vehicle.current_mileage);
        return {
          ...(vehicle as unknown as GarageVehicle),
          currentMileage,
          current_mileage: currentMileage,
        };
      });
      return {
        data: mapped as GarageVehicle[] | null,
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
    expenseForVehicle: async (vehicleId: string, periodDays?: number | null) => {
      const range = periodDays && periodDays > 0
        ? { p_period_start: daysAgo(periodDays), p_period_end: toDayIso() }
        : {};
      const { data, error } = await client.rpc("vehicle_expense_summary", {
        p_vehicle_id: vehicleId,
        ...range,
      });
      if (error) return { data: null, error: error ?? null };
      return { data: data as VehicleExpenseSummary | null, error: null };
    },
    registerMileage: async (vehicleId, input: MileageInput) => {
      const { data, error } = await client.rpc("register_vehicle_mileage", {
        p_vehicle_id: vehicleId,
        p_mileage: input.mileageValue,
        p_recorded_at: input.recordedAt,
        p_note: input.note ?? null,
        p_idempotency_key: null,
      });
      if (error) return { data: null, error: error ?? null };
      const logId = (data as { log_id?: string } | null)?.log_id ?? null;
      if (!logId) return { data: null, error: { message: "A VERAH não retornou o registro de quilometragem." } };
      const { data: row, error: readError } = await client
        .from("vehicle_mileage_logs")
        .select("id,vehicle_id,recorded_at,mileage_value,note,created_at")
        .eq("id", logId)
        .maybeSingle();
      if (readError || !row) return { data: null, error: { message: "Registro salvo, mas não foi possível carregá-lo agora." } };
      return { data: mapMileageLog(row as Record<string, unknown>), error: null };
    },
    listMileage: async (vehicleId) => {
      const { data, error } = await client
        .from("vehicle_mileage_logs")
        .select("id,vehicle_id,recorded_at,mileage_value,note,created_at")
        .eq("vehicle_id", vehicleId)
        .order("recorded_at", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) return { data: null, error: error ?? null };
      const mapped = (data ?? []).map((row) =>
        mapMileageLog(row as Record<string, unknown>),
      );
      return { data: mapped, error: null };
    },
    registerFuel: async (vehicleId, input: FuelInput) => {
      const { data, error } = await client.rpc("register_vehicle_fuel", {
        p_vehicle_id: vehicleId,
        p_recorded_at: input.recordedAt,
        p_odometer_value: input.odometerValue,
        p_liters: input.liters,
        p_total_amount: input.totalAmount,
        p_fuel_type: input.fuelType,
        p_note: input.note ?? null,
        p_idempotency_key: null,
      });
      if (error) return { data: null, error: error ?? null };
      const logId = (data as { log_id?: string } | null)?.log_id ?? null;
      if (!logId) return { data: null, error: { message: "A VERAH não retornou o registro de abastecimento." } };
      const { data: row, error: readError } = await client
        .from("vehicle_fuel_logs")
        .select("id,vehicle_id,recorded_at,odometer_value,liters,total_amount,fuel_type,consumption_kmpl,note,created_at")
        .eq("id", logId)
        .maybeSingle();
      if (readError || !row) return { data: null, error: { message: "Registro salvo, mas não foi possível carregá-lo agora." } };
      return { data: mapFuelLog(row as Record<string, unknown>), error: null };
    },
    listFuel: async (vehicleId) => {
      const { data, error } = await client
        .from("vehicle_fuel_logs")
        .select("id,vehicle_id,recorded_at,odometer_value,liters,total_amount,fuel_type,consumption_kmpl,note,created_at")
        .eq("vehicle_id", vehicleId)
        .order("recorded_at", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) return { data: null, error: error ?? null };
      const mapped = (data ?? []).map((row) =>
        mapFuelLog(row as Record<string, unknown>),
      );
      return { data: mapped, error: null };
    },
    registerCharging: async (vehicleId, input: ChargingInput) => {
      const { data, error } = await client.rpc("register_vehicle_charging", {
        p_vehicle_id: vehicleId,
        p_recorded_at: input.recordedAt,
        p_odometer_value: input.odometerValue,
        p_kwh: input.kwh,
        p_total_amount: input.totalAmount,
        p_battery_percent: input.batteryPercent ?? null,
        p_charging_type: input.chargingType ?? null,
        p_note: input.note ?? null,
        p_idempotency_key: null,
      });
      if (error) return { data: null, error: error ?? null };
      const logId = (data as { log_id?: string } | null)?.log_id ?? null;
      if (!logId) return { data: null, error: { message: "A VERAH não retornou o registro de recarga." } };
      const { data: row, error: readError } = await client
        .from("vehicle_charging_logs")
        .select("id,vehicle_id,recorded_at,odometer_value,kwh,total_amount,battery_percent,charging_type,consumption_km_kwh,note,created_at")
        .eq("id", logId)
        .maybeSingle();
      if (readError || !row) return { data: null, error: { message: "Registro salvo, mas não foi possível carregá-lo agora." } };
      return { data: mapChargingLog(row as Record<string, unknown>), error: null };
    },
    listCharging: async (vehicleId) => {
      const { data, error } = await client
        .from("vehicle_charging_logs")
        .select("id,vehicle_id,recorded_at,odometer_value,kwh,total_amount,battery_percent,charging_type,consumption_km_kwh,note,created_at")
        .eq("vehicle_id", vehicleId)
        .order("recorded_at", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) return { data: null, error: error ?? null };
      const mapped = (data ?? []).map((row) =>
        mapChargingLog(row as Record<string, unknown>),
      );
      return { data: mapped, error: null };
    },
    listVehicleDocuments: async (vehicleId) => {
      const { data, error } = await client
        .from("vehicle_documents")
        .select(vehicleDocumentSelect)
        .eq("vehicle_id", vehicleId)
        .order("document_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) return { data: null, error: error ?? null };
      const mapped = (data ?? []).map((row) =>
        mapVehicleDocument(row as Record<string, unknown>),
      );
      return { data: mapped, error: null };
    },
    registerVehicleDocument: async (vehicleId: string, input: VehicleDocumentInput, bytes: Blob) =>
      registerVehicleDocumentSafely(
        {
          register: async (params) => {
            const { data, error } = await client.rpc("register_vehicle_document", {
              p_vehicle_id: params.vehicleId,
              p_document_kind: params.documentKind,
              p_document_date: params.documentDate,
              p_file_name: params.fileName,
              p_mime_type: params.mimeType,
              p_size_bytes: params.sizeBytes,
              p_idempotency_key: params.idempotencyKey,
              p_reference: params.reference ?? null,
              p_note: params.note ?? null,
            });
            if (error) return { error: error ?? null };
            const row = (data ?? {}) as Record<string, unknown>;
            return {
              data: {
                documentId: row.document_id as string,
                storageBucket: row.storage_bucket as string,
                storagePath: row.storage_path as string,
                fileName: row.file_name as string,
                mimeType: row.mime_type as string,
                sizeBytes: Number(row.size_bytes),
              },
              error: null,
            };
          },
          upload: async (bucket, path, bytes, contentType) => {
            const { error } = await client.storage.from(bucket).upload(path, bytes, {
              contentType,
              upsert: false,
            });
            if (!error) return { error: null };
            return {
              error: {
                message: error.message,
                statusCode: error.statusCode != null ? Number(error.statusCode) : undefined,
              },
            };
          },
          remove: async (documentId) => {
            const { error } = await client.rpc("remove_vehicle_document", { p_document_id: documentId });
            return { error: error ?? null };
          },
        },
        vehicleId,
        input,
        bytes,
        new Date().toISOString().slice(0, 10),
      ),
    removeVehicleDocument: async (documentId) => {
      const { error } = await client.rpc("remove_vehicle_document", { p_document_id: documentId });
      return { error: error ?? null };
    },
  };
  return cachedJourneyFacade;
}
