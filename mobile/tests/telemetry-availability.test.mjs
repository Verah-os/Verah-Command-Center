import assert from "node:assert/strict";
import test from "node:test";

import {
  CHARGING_UNAVAILABLE_MESSAGE,
  FUEL_UNAVAILABLE_MESSAGE,
  HOME_LOAD_UNAVAILABLE_MESSAGE,
  createCustomerJourney,
} from "../src/customer-journey.ts";

// The in-memory facade is a deliberately necessary seam: Node CI has no
// React Native runtime, so the real binding in `src/supabase.ts` cannot be
// loaded here. These tests exercise the fail-closed telemetry availability
// contract: an unavailable source must not hide an independent available
// source, raw backend/schema wording must never reach customer-facing output,
// and retries recover without inventing data.

function buildFacade(overrides = {}) {
  const onboarding = {
    onboarding_status: "completed",
    basic_profile_completed: true,
    vehicle_status: "registered",
  };
  const vehicles = [
    { id: "v-1", brand: "Honda", model: "Civic", year: 2022, plate: "ABC1D23", nickname: null },
  ];
  const facade = {
    refreshOnboarding: async () => ({ data: onboarding, error: null }),
    startOnboarding: async () => ({ error: null }),
    completeBasicProfile: async () => ({ error: null }),
    confirmVehicle: async () => ({ error: null }),
    deactivateVehicle: async () => ({ error: null }),
    listVehicles: async () => (
      overrides.listVehiclesError ? { data: null, error: { message: overrides.listVehiclesError } } : { data: vehicles, error: null }
    ),
    listServiceRequests: async () => (
      overrides.listServiceRequestsError ? { data: null, error: { message: overrides.listServiceRequestsError } } : { data: [], error: null }
    ),
    registerMileage: async () => ({ data: null, error: null }),
    listMileage: async () => ({ data: [], error: null }),
    registerFuel: async () => ({ data: null, error: null }),
    listFuel: async (vehicleId) => (
      overrides.listFuelError ? { data: null, error: { message: overrides.listFuelError } } : { data: [], error: null }
    ),
    registerCharging: async () => ({ data: null, error: null }),
    listCharging: async (vehicleId) => (
      overrides.listChargingError ? { data: null, error: { message: overrides.listChargingError } } : { data: [], error: null }
    ),
    listMaintenance: async () => ({ data: [], error: null }),
    expenseForVehicle: async () => ({ data: null, error: null }),
  };
  return facade;
}

const user = { id: "u-1", email: "maria@verah.dev" };
const SCHEMA_CACHE_WORDING = "PGRST301 schema cache is stale";

test("loadEnergy reports fuel unavailable without hiding available charging", async () => {
  const controller = createCustomerJourney(buildFacade({ listFuelError: SCHEMA_CACHE_WORDING }), user);
  await controller.restore();
  const result = await controller.loadEnergy("v-1");
  assert.equal(result.fuel.ok, false);
  assert.equal(result.fuel.message, FUEL_UNAVAILABLE_MESSAGE);
  assert.equal(result.fuel.message.includes("PGRST"), false);
  assert.equal(result.charging.ok, true);
  assert.deepEqual(result.charging.data.logs, []);
});

test("loadEnergy reports charging unavailable without hiding available fuel", async () => {
  const controller = createCustomerJourney(buildFacade({ listChargingError: SCHEMA_CACHE_WORDING }), user);
  await controller.restore();
  const result = await controller.loadEnergy("v-1");
  assert.equal(result.fuel.ok, true);
  assert.deepEqual(result.fuel.data.logs,  []);
  assert.equal(result.charging.ok, false);
  assert.equal(result.charging.message, CHARGING_UNAVAILABLE_MESSAGE);
  assert.equal(result.charging.message.includes("PGRST"), false);
});

test("loadEnergy fails closed with customer-safe messages when both sources error", async () => {
  const controller = createCustomerJourney(buildFacade({
    listFuelError: SCHEMA_CACHE_WORDING,
    listChargingError: SCHEMA_CACHE_WORDING,
  }), user);
   await controller.restore();
  const result = await controller.loadEnergy("v-1");
  assert.equal(result.fuel.ok, false);
  assert.equal(result.fuel.message, FUEL_UNAVAILABLE_MESSAGE);
  assert.equal(result.charging.ok, false);
  assert.equal(result.charging.message, CHARGING_UNAVAILABLE_MESSAGE);
});
 

test("listFuel surfaces customer-safe message instead of raw backend wording", async () => {
  const controller = createCustomerJourney(buildFacade({ listFuelError: SCHEMA_CACHE_WORDING }), user);
  await controller.restore();
  const result = await controller.listFuel("v-1");
  assert.equal(result.ok, false);
  assert.equal(result.message, FUEL_UNAVAILABLE_MESSAGE);
});

test("listCharging surfaces customer-safe message instead of raw backend wording", async () => {
  const controller = createCustomerJourney(buildFacade({ listChargingError: SCHEMA_CACHE_WORDING }), user);
 await controller.restore();
  const result = await controller.listCharging("v-1");
  assert.equal(result.ok, false);
  assert.equal(result.message, CHARGING_UNAVAILABLE_MESSAGE);
});
 

test("home fails closed with customer-safe message when vehicles source errors", async () => {
  const controller = createCustomerJourney(buildFacade({ listVehiclesError: SCHEMA_CACHE_WORDING }), user);
  await controller.restore();
  assert.equal(controller.getState().status, "error");
  assert.equal(controller.getState().message, HOME_LOAD_UNAVAILABLE_MESSAGE);
});

test("retry recovers after transient fuel source outage without inventing data", async () => {
  let fuelFails = true;
  const facade = buildFacade();
  facade.listFuel = async () => {
    if (fuelFails) {
      fuelFails = false;
      return { data: null, error: { message: SCHEMA_CACHE_WORDING } };
    }
    return { data: [], error: null };
  };
  const controller = createCustomerJourney(facade, user);
 await controller.restore();
  const first = await controller.loadEnergy("v-1");
  assert.equal(first.fuel.ok, false);
  assert.equal(first.fuel.message, FUEL_UNAVAILABLE_MESSAGE);
  const second = await controller.loadEnergy("v-1");
  assert.equal(second.fuel.ok, true);
  assert.deepEqual(second.fuel.data.logs,  []);
  assert.equal(second.fuel.data.latest, null);
});