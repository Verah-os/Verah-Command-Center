import { resolveVehicleIntelligence } from "../vehicle-intelligence/service.ts";
import type { VehicleIntelligenceProvider } from "../vehicle-intelligence/types.ts";

const oldBrazilianPlate = /^[A-Z]{3}\d{4}$/;
const mercosulPlate = /^[A-Z]{3}\d[A-Z]\d{2}$/;

export type VehicleOnboardingDraft = {
  plate: string;
  brand: string;
  model: string;
  modelYear: number;
  version: string | null;
  engine: string | null;
  transmission: string | null;
  source: "manual" | "local_fixture" | "external_provider";
  synthetic: boolean;
  confirmed: false;
};

export function normalizeBrazilianPlate(value: string) {
  const normalized = value.trim().toUpperCase().replace(/[\s-]/g, "");
  return oldBrazilianPlate.test(normalized) || mercosulPlate.test(normalized)
    ? normalized
    : null;
}

export function prepareManualVehicle(input: {
  plate: string;
  brand: string;
  model: string;
  modelYear: string | number;
  version?: string;
  engine?: string;
  transmission?: string;
}): VehicleOnboardingDraft {
  const plate = normalizeBrazilianPlate(input.plate);
  const modelYear = Number(input.modelYear);
  const brand = input.brand.trim();
  const model = input.model.trim();
  if (
    !plate ||
    !brand ||
    !model ||
    !Number.isInteger(modelYear) ||
    modelYear < 1950 ||
    modelYear > new Date().getFullYear() + 1
  ) {
    throw new Error("invalid_vehicle");
  }
  return {
    plate,
    brand,
    model,
    modelYear,
    version: input.version?.trim() || null,
    engine: input.engine?.trim() || null,
    transmission: input.transmission?.trim() || null,
    source: "manual",
    synthetic: false,
    confirmed: false,
  };
}

export async function lookupVehicleForOnboarding(
  plateInput: string,
  providers: VehicleIntelligenceProvider[],
) {
  const plate = normalizeBrazilianPlate(plateInput);
  if (!plate) throw new Error("invalid_plate");
  const result = await resolveVehicleIntelligence({
    request: { vehicleReference: plate },
    providers,
  });
  if (result.status !== "available" || !result.vehicle || !result.observations[0]) {
    return {
      status: "manual_required" as const,
      plate,
      customerConfirmationRequired: true as const,
    };
  }
  const observation = result.observations[0];
  return {
    status: "suggested" as const,
    plate,
    vehicle: result.vehicle,
    provenance: observation.evidence,
    customerConfirmationRequired: true as const,
  };
}
