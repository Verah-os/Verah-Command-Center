export const SERVICE_URGENCIES = ["baixa", "media", "alta", "critica"] as const;
export type ServiceUrgency = (typeof SERVICE_URGENCIES)[number];
export type PickupLocationSource = "manual_address" | "device_location";

export type ServiceRequestInput = {
  vehicleId: string;
  state: string;
  city: string;
  address: string;
  report: string;
  urgency: ServiceUrgency;
  pickupSource: PickupLocationSource;
  latitude?: number | null;
  longitude?: number | null;
  pickupInstructions?: string;
};

export type ServiceRequestDraft = {
  vehicleId: string;
  state: string;
  city: string;
  address: string | null;
  report: string;
  urgency: ServiceUrgency;
  pickupSource: PickupLocationSource;
  latitude: number | null;
  longitude: number | null;
  pickupInstructions: string | null;
};

export function prepareServiceRequest(
  input: ServiceRequestInput,
): { ok: true; draft: ServiceRequestDraft } | { ok: false; message: string } {
  const vehicleId = input.vehicleId.trim();
  if (!vehicleId) return { ok: false, message: "Escolha o veículo do atendimento." };

  const state = input.state.trim().toUpperCase();
  const city = input.city.trim();
  const address = input.address.trim();
  const report = input.report.trim();
  const pickupInstructions = input.pickupInstructions?.trim() || null;

  if (!/^[A-Z]{2}$/.test(state)) {
    return { ok: false, message: "Informe a UF com duas letras, por exemplo SP." };
  }
  if (city.length < 2 || city.length > 120) {
    return { ok: false, message: "Informe a cidade onde o veículo está." };
  }
  if (!SERVICE_URGENCIES.includes(input.urgency)) {
    return { ok: false, message: "Escolha uma urgência válida." };
  }
  if (report.length < 15 || report.length > 3000) {
    return {
      ok: false,
      message: "Conte o que aconteceu com um pouco mais de detalhe (mínimo de 15 caracteres).",
    };
  }

  const latitude = input.latitude ?? null;
  const longitude = input.longitude ?? null;
  if (input.pickupSource === "manual_address" && address.length < 8) {
    return {
      ok: false,
      message: "Informe o endereço onde o veículo está, incluindo rua e número.",
    };
  }
  if (input.pickupSource === "device_location") {
    if (
      latitude === null ||
      longitude === null ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return { ok: false, message: "Não foi possível confirmar a localização atual." };
    }
  }
  if (pickupInstructions && pickupInstructions.length > 500) {
    return { ok: false, message: "A referência de retirada deve ter no máximo 500 caracteres." };
  }

  return {
    ok: true,
    draft: {
      vehicleId,
      state,
      city,
      address: address || null,
      report,
      urgency: input.urgency,
      pickupSource: input.pickupSource,
      latitude,
      longitude,
      pickupInstructions,
    },
  };
}
