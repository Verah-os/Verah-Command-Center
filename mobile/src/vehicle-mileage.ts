export const MAX_MILEAGE_KM = 2000000;

export type VehicleMileageLog = {
  id: string;
  vehicleId: string;
  recordedAt: string;
  odometerKm: number;
  note: string | null;
  createdAt: string;
};

export type MileageEntryInput = {
  odometerKm: string | number;
  recordedAt?: string;
  note?: string;
};

export type MileageEntryDraft = {
  vehicleId: string;
  recordedAt: string;
  odometerKm: number;
  note: string | null;
};

type RpcError = { message: string } | null;

export interface VehicleMileageFacade {
  listLogs(vehicleId: string): Promise<{ data: VehicleMileageLog[] | null; error: RpcError }>;
  addLog(draft: MileageEntryDraft): Promise<{ data: VehicleMileageLog | null; error: RpcError }>;
}

export function latestMileage(logs: VehicleMileageLog[]): VehicleMileageLog | null {
  if (!logs.length) return null;
  return [...logs].sort(
    (a, b) =>
      b.recordedAt.localeCompare(a.recordedAt) ||
      b.createdAt.localeCompare(a.createdAt),
  )[0];
}

export function prepareMileageEntry(
  input: MileageEntryInput,
): { ok: true; entry: { recordedAt: string; odometerKm: number; note: string | null } } | { ok: false; message: string } {
  const odometerKm = Number(String(input.odometerKm).trim().replace(/[.,]/g, ""));
  const note = input.note?.trim() || null;
  const recordedAtRaw = input.recordedAt?.trim() || new Date().toISOString();
  const recordedAt = new Date(recordedAtRaw);
  if (!Number.isInteger(odometerKm) || odometerKm < 0 || odometerKm > MAX_MILEAGE_KM) {

    return {
      ok: false,
      message: "Informe a quilometragem válida (de 0 a 2.000.000 km).",
    };
  }
  if (Number.isNaN(recordedAt.getTime()) || recordedAt.getTime() > Date.now() + 1000) {
    return { ok: false, message: "Informe uma data válida para o registro." };
  }
  if (note && note.length > 500) {
    return { ok: false, message: "A observação deve ter no máximo 500 caracteres." };
  }
  return {
    ok: true,
    entry: {
      recordedAt: recordedAt.toISOString(),
      odometerKm,
      note,
    },
  };
}

export interface VehicleMileageController {
  getState(): VehicleMileageState;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  addEntry(input: MileageEntryInput): Promise<{ ok: true } | { ok: false; message: string }>;
}

export type VehicleMileageState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; logs: VehicleMileageLog[]; latestKm: number | null };

export function createVehicleMileageController(
  facade: VehicleMileageFacade,
  vehicleId: string,
): VehicleMileageController {
  let state: VehicleMileageState = { status: "loading" };
  const listeners = new Set<() => void>();
  const emit = () => { for (const listener of listeners) listener(); };
  const fail = (message: string) => { state = { status: "error", message }; emit(); };

  const applyLogs = (logs: VehicleMileageLog[]) => {
    const latest = latestMileage(logs);
    state = {
      status: "ready",
      logs,
      latestKm: latest?.odometerKm ?? null,
    };
    emit();
  };

  const load = async () => {
    state = { status: "loading" }; emit();
    const result = await facade.listLogs(vehicleId);
    if (result.error) { fail(result.error.message); return; }
    applyLogs(result.data ?? []);
  };

  return {
    getState: () => state,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load,
    async addEntry(input) {
      const prepared = prepareMileageEntry(input);
      if (!prepared.ok) return prepared;
      const current = state.status === "ready" ? state.latestKm : null;
      if (current !== null && prepared.entry.odometerKm < current) {
        return {
          ok: false,
          message: `A quilometragem não pode ser menor que a última registrada (${current.toLocaleString("pt-BR")} km).`,
        };
      }
      const result = await facade.addLog({
        vehicleId,
        ...prepared.entry,
      });
      if (result.error) return { ok: false, message: result.error.message };
      if (result.data) applyLogs([...(state.status === "ready" ? state.logs : []), result.data]);
      return { ok: true };
    },
  };
}