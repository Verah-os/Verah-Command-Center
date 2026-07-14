import { env } from "@/lib/env";
import { createSupabaseServerClient } from "@/services/supabase/server";
import type { ServiceProvider } from "@/types/service-provider";
import type { CustomerProviderProfile } from "@/types/customer-provider";

const columns = "id,name,trade_name,city,specialties,status,rating";
function mapProvider(row: Record<string, unknown>): ServiceProvider {
  return {
    id: row.id as string,
    name: row.name as string,
    tradeName: row.trade_name as string | null,
    city: row.city as string,
    specialties: (row.specialties as string[]) ?? [],
    status: row.status as ServiceProvider["status"],
    rating: row.rating === null ? null : Number(row.rating),
  };
}
export async function listActiveProviders() {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("service_providers")
    .select(columns)
    .eq("status", "active");
  return error
    ? []
    : (data ?? []).map((row) => mapProvider(row as Record<string, unknown>));
}
export async function listActiveProvidersWithPortal(): Promise<ServiceProvider[]> {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(
    "list_active_service_providers_with_portal",
  );
  return error
    ? []
    : (data ?? []).map((row: Record<string, unknown>) => ({
        ...mapProvider(row),
        portalActive: Boolean(row.portal_active),
      }));
}
export async function getActiveProvider(id: string) {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("service_providers")
    .select(columns)
    .eq("id", id)
    .eq("status", "active")
    .maybeSingle();
  return error || !data ? null : mapProvider(data as Record<string, unknown>);
}
export async function getCustomerProviderProfile(
  id: string,
): Promise<CustomerProviderProfile | null> {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("service_providers")
    .select("city,specialties,status,rating")
    .eq("id", id)
    .eq("status", "active")
    .maybeSingle();
  return error || !data
    ? null
    : {
        city: data.city,
        specialties: data.specialties ?? [],
        status: data.status,
        rating: data.rating === null ? null : Number(data.rating),
      };
}
export async function getProviderStats() {
  const providers = await listActiveProviders();
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("service_requests")
    .select("id", { count: "exact", head: true })
    .not("provider_id", "is", null);
  return { active: providers.length, assigned: count ?? 0 };
}
