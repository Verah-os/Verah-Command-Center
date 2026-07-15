import { env } from "@/lib/env";
import { createSupabaseServerClient } from "@/services/supabase/server";
import type { CustomerVehicle } from "@/types/customer-vehicle";

const columns =
  "id,owner_id,nickname,brand,model,year,plate,state,city,current_mileage,last_service_at,next_service_date,next_service_mileage,active,created_at,updated_at";

function mapVehicle(row: Record<string, unknown>): CustomerVehicle {
  return {
    id: row.id as string,
    ownerId: row.owner_id as string,
    nickname: row.nickname as string | null,
    brand: row.brand as string,
    model: row.model as string,
    year: row.year as number | null,
    plate: row.plate as string | null,
    state: row.state as string | null,
    city: row.city as string | null,
    currentMileage:
      row.current_mileage === null ? null : Number(row.current_mileage),
    lastServiceAt: row.last_service_at as string | null,
    nextServiceDate: row.next_service_date as string | null,
    nextServiceMileage:
      row.next_service_mileage === null
        ? null
        : Number(row.next_service_mileage),
    active: row.active as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function listCustomerVehicles() {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return [];
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("customer_vehicles")
    .select(columns)
    .eq("owner_id", user.id)
    .eq("active", true)
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []).map((row) => mapVehicle(row as Record<string, unknown>));
}

export async function getCustomerVehicle(id: string) {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("customer_vehicles")
    .select(columns)
    .eq("id", id)
    .eq("owner_id", user.id)
    .eq("active", true)
    .maybeSingle();
  return error || !data ? null : mapVehicle(data as Record<string, unknown>);
}
