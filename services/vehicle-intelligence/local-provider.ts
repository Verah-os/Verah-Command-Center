import type {
  VehicleIntelligenceObservation,
  VehicleIntelligenceProvider,
} from "./types.ts";

export const DEMO_VEHICLE_REFERENCE = "DEMO-VEH-001";

// Documented demo plate (valid Mercosul format) mapped to the same synthetic
// fixture so plate-first onboarding can reach the suggestion path. It is a
// fixture alias, never a real vehicle or an official lookup result.
export const DEMO_VEHICLE_PLATE = "VRH1A23";

const demoObservation: VehicleIntelligenceObservation = {
  vehicle: {
    brand: "Volkswagen",
    model: "Polo",
    manufactureYear: 2021,
    modelYear: 2022,
    version: "1.0 MPI",
    engine: "1.0 flex",
    transmission: "Manual de 5 marchas",
  },
  evidence: {
    provider: "verah_local_fixture",
    source: "verah_synthetic_demo_fixture",
    observedAt: "2026-08-21T00:00:00.000Z",
    confidence: null,
    synthetic: true,
  },
};

export function createLocalVehicleIntelligenceProvider(): VehicleIntelligenceProvider {
  return {
    id: "verah_local_fixture",
    access: "local_fixture",
    paid: false,
    estimatedCostMicrounits: 0,
    async lookup(request) {
      if (
        request.vehicleReference !== DEMO_VEHICLE_REFERENCE &&
        request.vehicleReference !== DEMO_VEHICLE_PLATE
      ) {
        return null;
      }
      return {
        vehicle: { ...demoObservation.vehicle },
        evidence: { ...demoObservation.evidence },
      };
    },
  };
}

