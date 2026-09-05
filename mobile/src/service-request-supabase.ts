import type { CustomerServiceRequest } from "./customer-journey";
import { getSupabaseClient } from "./supabase";
import {
  prepareServiceRequest,
  type ServiceRequestInput,
} from "./service-request";

const trackingSelect =
  "id,reference_code,vehicle_brand,vehicle_model,vehicle_year,city,state,service_stage,customer_report,copilot_customer_message,probable_category,copilot_summary,perceived_urgency,concierge_accepted_at,provider_assigned_at,completed_at,completion_notes,customer_rating,created_at";

function nullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

export function mapCustomerServiceRequest(
  row: Record<string, unknown>,
): CustomerServiceRequest {
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

export async function createMobileServiceRequest(input: ServiceRequestInput): Promise<
  | { ok: true; request: CustomerServiceRequest }
  | { ok: false; message: string }
> {
  const prepared = prepareServiceRequest(input);
  if (!prepared.ok) return prepared;

  const client = getSupabaseClient();
  if (!client) return { ok: false, message: "Supabase não configurado nesta build." };

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, message: "Sua sessão expirou. Entre novamente." };

  const { data: vehicle, error: vehicleError } = await client
    .from("customer_vehicles")
    .select("id,brand,model,year,plate")
    .eq("id", prepared.draft.vehicleId)
    .eq("active", true)
    .maybeSingle();
  if (vehicleError || !vehicle) {
    return { ok: false, message: "O veículo selecionado não está disponível." };
  }

  const { data: customer, error: customerError } = await client
    .from("customers")
    .select("id,display_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (customerError || !customer?.id) {
    return {
      ok: false,
      message: "Não foi possível vincular o atendimento ao seu cadastro VERAH.",
    };
  }

  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = Date.now().toString(36).slice(-5).toUpperCase();
  const referenceCode = `VRH-${date}-${suffix}`;

  const { data, error } = await client
    .from("service_requests")
    .insert({
      reference_code: referenceCode,
      customer_id: customer.id,
      customer_name:
        customer.display_name || user.email?.split("@")[0] || "Cliente VERAH",
      customer_phone: null,
      vehicle_id: vehicle.id,
      vehicle_brand: vehicle.brand,
      vehicle_model: vehicle.model,
      vehicle_year: vehicle.year,
      vehicle_plate: vehicle.plate,
      state: prepared.draft.state,
      city: prepared.draft.city,
      origin: "customer",
      has_insurance: "unknown",
      has_roadside_assistance: "unknown",
      customer_report: prepared.draft.report,
      perceived_urgency: prepared.draft.urgency,
      service_stage: "solicitado",
      requires_human_review: true,
      created_by: user.id,
      pickup_address: prepared.draft.address,
      pickup_latitude: prepared.draft.latitude,
      pickup_longitude: prepared.draft.longitude,
      pickup_location_source: prepared.draft.pickupSource,
      pickup_location_confirmed_at: new Date().toISOString(),
      pickup_instructions: prepared.draft.pickupInstructions,
    })
    .select(trackingSelect)
    .single();

  if (error || !data) {
    return {
      ok: false,
      message: error?.message || "Não foi possível criar o atendimento.",
    };
  }

  return {
    ok: true,
    request: mapCustomerServiceRequest(data as Record<string, unknown>),
  };
}

export { trackingSelect };
