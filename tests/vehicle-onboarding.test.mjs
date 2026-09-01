import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  lookupVehicleForOnboarding,
  normalizeBrazilianPlate,
  prepareManualVehicle,
} from "../services/customer-vehicles/onboarding.ts";
import {
  createLocalVehicleIntelligenceProvider,
  DEMO_VEHICLE_PLATE,
} from "../services/vehicle-intelligence/local-provider.ts";

test("Brazilian plates are normalized without becoming vehicle identity", () => {
  assert.equal(normalizeBrazilianPlate("abc-1234"), "ABC1234");
  assert.equal(normalizeBrazilianPlate(" abc1d23 "), "ABC1D23");
  assert.equal(normalizeBrazilianPlate("ABC 1234"), "ABC1234");
  assert.equal(normalizeBrazilianPlate("AB12345"), null);
  assert.equal(normalizeBrazilianPlate("ABC12D3"), null);
});

test("manual vehicle data stays pending until explicit customer confirmation", () => {
  const draft = prepareManualVehicle({
    plate: "abc-1234",
    brand: "Volkswagen",
    model: "Polo",
    modelYear: "2022",
    version: "1.0 MPI",
  });

  assert.deepEqual(draft, {
    plate: "ABC1234",
    brand: "Volkswagen",
    model: "Polo",
    modelYear: 2022,
    version: "1.0 MPI",
    engine: null,
    transmission: null,
    source: "manual",
    synthetic: false,
    confirmed: false,
  });
});

test("lookup preserves provider provenance and never presents synthetic data as official", async () => {
  const provider = {
    id: "local_test_fixture",
    access: "local_fixture",
    paid: false,
    estimatedCostMicrounits: 0,
    async lookup() {
      return {
        vehicle: { brand: "Volkswagen", model: "Polo", modelYear: 2022 },
        evidence: {
          provider: "local_test_fixture",
          source: "synthetic_test_data",
          observedAt: "2026-08-27T00:00:00.000Z",
          confidence: null,
          synthetic: true,
        },
      };
    },
  };

  const result = await lookupVehicleForOnboarding("abc1d23", [provider]);

  assert.equal(result.status, "suggested");
  assert.equal(result.plate, "ABC1D23");
  assert.equal(result.provenance.provider, "local_test_fixture");
  assert.equal(result.provenance.synthetic, true);
  assert.equal(result.customerConfirmationRequired, true);
});

test("missing provider data degrades to a safe manual fallback", async () => {
  const result = await lookupVehicleForOnboarding("ABC1234", []);

  assert.deepEqual(result, {
    status: "manual_required",
    plate: "ABC1234",
    customerConfirmationRequired: true,
  });
});

test("service creation reuses a confirmed canonical vehicle instead of creating another", async () => {
  const source = await readFile(
    new URL("../services/service-requests/actions.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /\.from\("customer_vehicles"\)[\s\S]*\.eq\("id", selectedVehicleId\)[\s\S]*\.eq\("active", true\)/);
  assert.match(source, /Cadastre e confirme seu veículo antes de abrir o atendimento/);
  assert.doesNotMatch(source, /\.from\("customer_vehicles"\)\s*\.insert/);
});

test("documented demo plate reaches the synthetic suggestion without weakening plate validation", async () => {
  assert.equal(normalizeBrazilianPlate(DEMO_VEHICLE_PLATE), DEMO_VEHICLE_PLATE);

  const result = await lookupVehicleForOnboarding(DEMO_VEHICLE_PLATE, [
    createLocalVehicleIntelligenceProvider(),
  ]);

  assert.equal(result.status, "suggested");
  assert.equal(result.plate, DEMO_VEHICLE_PLATE);
  assert.equal(result.provenance.provider, "verah_local_fixture");
  assert.equal(result.provenance.synthetic, true);
  assert.equal(result.customerConfirmationRequired, true);
});

test("service requests require a confirmed canonical vehicle and skip the fixed catalog for it", async () => {
  const source = await readFile(
    new URL("../services/service-requests/actions.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /\.not\("customer_confirmed_at", "is", null\)/,
  );
  assert.match(
    source,
    /!canonicalVehicleSelected && !isValidVehicle\(vehicleBrand, vehicleModel\)/,
  );
});

test("canonical vehicle confirmation promotes matching backend-created vehicles", async () => {
  const migration = await readFile(
    new URL(
      "../supabase/migrations/20260827040000_vehicle_onboarding.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    migration,
    /update public\.customer_vehicles[\s\S]*data_source = 'customer_confirmed'[\s\S]*perform public\.refresh_customer_onboarding\(\);[\s\S]*'created', false/,
  );
  assert.match(
    migration,
    /on public\.service_requests[\s\S]*vehicle\.customer_confirmed_at is not null/,
  );
});
