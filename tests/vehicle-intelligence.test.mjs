import assert from "node:assert/strict";
import test from "node:test";

import {
  createLocalVehicleIntelligenceProvider,
  DEMO_VEHICLE_REFERENCE,
  InMemoryVehicleIntelligenceCache,
  resolveVehicleIntelligence,
} from "../services/vehicle-intelligence/index.ts";

test("local provider returns normalized synthetic data with provenance", async () => {
  const result = await resolveVehicleIntelligence({
    request: { vehicleReference: DEMO_VEHICLE_REFERENCE },
    providers: [createLocalVehicleIntelligenceProvider()],
  });

  assert.equal(result.status, "available");
  assert.deepEqual(result.vehicle, {
    brand: "Volkswagen",
    model: "Polo",
    manufactureYear: 2021,
    modelYear: 2022,
    version: "1.0 MPI",
    engine: "1.0 flex",
    transmission: "Manual de 5 marchas",
  });
  assert.deepEqual(result.observations[0].evidence, {
    provider: "verah_local_fixture",
    source: "verah_synthetic_demo_fixture",
    observedAt: "2026-08-21T00:00:00.000Z",
    confidence: null,
    synthetic: true,
  });
});

test("unavailable provider returns a safe fallback", async () => {
  const result = await resolveVehicleIntelligence({
    request: { vehicleReference: "UNKNOWN" },
    providers: [provider("fixture_unavailable", async () => null)],
  });
  assert.deepEqual(result, {
    status: "unavailable",
    vehicle: null,
    observations: [],
    requiresHumanReview: false,
    reason: "provider_unavailable",
  });
});

test("provider timeout returns a safe state and aborts work", async () => {
  let aborted = false;
  const events = [];
  const result = await resolveVehicleIntelligence({
    request: { vehicleReference: DEMO_VEHICLE_REFERENCE },
    providers: [provider("fixture_timeout", (_request, { signal }) => new Promise((resolve) => {
      signal.addEventListener("abort", () => {
        aborted = true;
        resolve(null);
      });
    }))],
    policy: { timeoutMs: 5 },
    onEvent: (event) => events.push(event),
  });
  assert.equal(result.status, "unavailable");
  assert.equal(aborted, true);
  assert.deepEqual(events, [{ provider: "fixture_timeout", code: "provider_timeout" }]);
});

test("conflicting provider observations require human review", async () => {
  const first = observation({ modelYear: 2022 }, "fixture_first");
  const second = observation({ modelYear: 2023 }, "fixture_second");
  const result = await resolveVehicleIntelligence({
    request: { vehicleReference: DEMO_VEHICLE_REFERENCE },
    providers: [
      provider("fixture_first", async () => first),
      provider("fixture_second", async () => second),
    ],
  });
  assert.equal(result.status, "review_required");
  assert.equal(result.vehicle, null);
  assert.equal(result.requiresHumanReview, true);
  assert.equal(result.reason, "provider_conflict");
  assert.equal(result.observations.length, 2);
});

test("optional vehicle fields may be absent", async () => {
  const minimal = observation({}, "fixture_minimal");
  delete minimal.vehicle.manufactureYear;
  delete minimal.vehicle.version;
  delete minimal.vehicle.engine;
  delete minimal.vehicle.transmission;
  const result = await resolveVehicleIntelligence({
    request: { vehicleReference: DEMO_VEHICLE_REFERENCE },
    providers: [provider("fixture_minimal", async () => minimal)],
  });
  assert.equal(result.status, "available");
  assert.deepEqual(result.vehicle, { brand: "Volkswagen", model: "Polo", modelYear: 2022 });
});

test("provider errors emit sanitized codes without PII or credentials", async () => {
  const events = [];
  await resolveVehicleIntelligence({
    request: { vehicleReference: "private-vehicle-reference" },
    providers: [provider("fixture_error", async () => {
      throw new Error("token ghp_abcdefghijklmnopqrstuvwxyz user@example.com +5511999999999");
    })],
    onEvent: (event) => events.push(event),
  });
  const serialized = JSON.stringify(events);
  assert.deepEqual(events, [{ provider: "fixture_error", code: "provider_unavailable" }]);
  assert.doesNotMatch(serialized, /ghp_|example\.com|551199|private-vehicle/i);
});

test("external or paid providers are blocked by default without invocation", async () => {
  let invoked = 0;
  const external = provider("commercial_provider", async () => {
    invoked += 1;
    return observation({}, "commercial_provider");
  }, { access: "external", paid: true, estimatedCostMicrounits: 1 });
  const result = await resolveVehicleIntelligence({
    request: { vehicleReference: DEMO_VEHICLE_REFERENCE },
    providers: [external],
  });
  assert.equal(invoked, 0);
  assert.equal(result.reason, "provider_blocked");
});

test("valid observations use the in-memory cache", async () => {
  let lookups = 0;
  const cachedProvider = provider("fixture_cached", async () => {
    lookups += 1;
    return observation({}, "fixture_cached");
  });
  const cache = new InMemoryVehicleIntelligenceCache();
  const options = {
    request: { vehicleReference: DEMO_VEHICLE_REFERENCE },
    providers: [cachedProvider],
    cache,
  };
  await resolveVehicleIntelligence(options);
  const second = await resolveVehicleIntelligence(options);
  assert.equal(second.status, "available");
  assert.equal(lookups, 1);
});

function provider(id, lookup, overrides = {}) {
  return {
    id,
    access: "local_fixture",
    paid: false,
    estimatedCostMicrounits: 0,
    lookup,
    ...overrides,
  };
}

function observation(overrides, providerId) {
  return {
    vehicle: {
      brand: "Volkswagen",
      model: "Polo",
      manufactureYear: 2021,
      modelYear: 2022,
      version: "1.0 MPI",
      engine: "1.0 flex",
      transmission: "Manual de 5 marchas",
      ...overrides,
    },
    evidence: {
      provider: providerId,
      source: "synthetic_test_fixture",
      observedAt: "2026-08-21T00:00:00.000Z",
      confidence: null,
      synthetic: true,
    },
  };
}

