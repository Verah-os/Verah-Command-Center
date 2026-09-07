import { getSupabaseClient } from "./supabase";
import type {
  VehicleMileageFacade,
  VehicleMileageLog,
} from "./vehicle-mileage";

const mileageSelect =
  "id,vehicle_id,recorded_at,odometer_km,note,created_at";

export function mapVehicleMileageLog(row: Record<string, unknown>): VehicleMileageLog {
  return {
    id: row.id as string,
    vehicleId: row.vehicle_id as string,
    recordedAt: row.recorded_at as string,
    odometerKm: Number(row.odometer_km),
    note: typeof row.note === "string" ? row.note : null,
    createdAt: row.created_at as string,
  };
}

export function getVehicleMileageFacade(vehicleId: string): VehicleMileageFacade | null {
  const client = getSupabaseClient();
  if (!client) return null;
  return {
    async listLogs(id) {
      const { data, error } = await client
        .from("vehicle_mileage_logs")
        .select(mileageSelect)
        .eq("vehicle_id", id)
        .order("recorded_at", { ascending: false })
        .order("created_at", { ascending: false });
      return {
        data: (data ?? []).map((row) =>
          mapVehicleMileageLog(row as Record<string, unknown>),
        ),
        error: error ?? null,
      };
    },
    async addLog(draft) {
      const { data, error } = await client
        .from("vehicle_mileage_logs")
        .insert({
          vehicle_id: draft.vehicleId,
          recorded_at: draft.recordedAt,
          odometer_km: draft.odometerKm,
          note: draft.note,
        })
        .select(mileageSelect)
        .single();
      if (error || !data) return { data: null, error: error ?? { message: "Não foi possível registrar a quilometragem." } };
      return { data: mapVehicleMileageLog(data as Record<string, unknown>), error: null };
    },
  };
}