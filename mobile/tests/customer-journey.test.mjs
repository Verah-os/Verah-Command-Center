import assert from "node:assert/strict";
import test from "node:test";

import {
  HOME_LOAD_UNAVAILABLE_MESSAGE,
  ONBOARDING_TERMS_VERSION,
  createCustomerJourney,
  defaultDisplayName,
  mapVehicleExpenseSummary,
  normalizeBrazilianPlate,
  prepareVehicleDraft,
} from "../src/customer-journey.ts";

// The in-memory facade is a deliberately necessary seam: Node CI has no
// React Native runtime, so the real binding in `src/supabase.ts` cannot be
// loaded here. The tests exercise the `createCustomerJourney` code path
// (restore/bootstrap, routing, basic profile, vehicle confirmation, garage)
// through this minimal transport that mimics the canonical #139 RPCs.
function createFakeFacade(overrides = {}) {
  const calls = { refresh: 0, start: 0, complete: 0, confirm: 0, list: 0, registerMileage: 0, listMileage: 0 };
  let onboarding = overrides.onboarding ?? {
    onboarding_status: "in_progress",
    basic_profile_completed: false,
    vehicle_status: "pending",
  };
  let vehicles = overrides.vehicles ?? [];
  const startedNames = [];
  const facade = {
    refreshOnboarding: async () => {
      calls.refresh += 1;
      if (overrides.refreshError && (!overrides.refreshFailsUntilStart || calls.start === 0)) {
        return { data: null, error: { message: overrides.refreshError } };
      }
      return { data: onboarding, error: null };
    },
    startOnboarding: async (displayName) => {
      calls.start += 1;
      startedNames.push(displayName);
      if (overrides.startError) return { error: { message: overrides.startError } };
      return { error: null };
    },
    completeBasicProfile: async (displayName) => {
      calls.complete += 1;
      if (overrides.completeError) return { error: { message: overrides.completeError } };
      assert.ok(displayName.trim().length > 0);
      onboarding = { ...onboarding, basic_profile_completed: true };
      return { error: null };
    },
    confirmVehicle: async (draft) => {
      calls.confirm += 1;
      if (overrides.confirmError) return { error: { message: overrides.confirmError } };
      vehicles = [
        ...vehicles,
        {
          id: `v-${calls.confirm}`,
          brand: draft.brand,
          model: draft.model,
          year: draft.modelYear,
          plate: draft.plate,
          nickname: null,
        },
      ];
      // Mirrors the RPC: confirm_customer_vehicle refreshes onboarding
      // server-side before returning.
      onboarding = {
        ...onboarding,
        vehicle_status: "registered",
        onboarding_status: "completed",
      };
      return { error: null };
    },
    listVehicles: async () => {
      calls.list += 1;
      if (overrides.listError) return { data: null, error: { message: overrides.listError } };
      return { data: vehicles, error: null };
    },
    registerMileage: async (vehicleId, input) => {
      calls.registerMileage += 1;
      if (overrides.registerMileageError) return { data: null, error: { message: overrides.registerMileageError } };
      const log = {
        id: `m-${calls.registerMileage}`,
        vehicleId,
        recordedAt: input.recordedAt ?? new Date().toISOString(),
        mileageValue: input.mileageValue,
        note: input.note ?? null,
        createdAt: new Date().toISOString(),
      };
      logs.push(log);
      return { data: log, error: null };
    },
    listMileage: async (vehicleId) => {
      calls.listMileage += 1;
      if (overrides.listMileageError) return { data: null, error: { message: overrides.listMileageError } };
      return { data: logs.filter((log) => log.vehicleId === vehicleId), error: null };
    },
  };
  let logs = [];
  return { facade, calls, startedNames, getVehicles: () => vehicles, getLogs: () => logs };
}

const user = { id: "u-1", email: "maria@verah.dev" };
const validVehicle = {
  plate: "abc1d23",
  brand: "Honda",
  model: "Civic",
  modelYear: "2022",
};

test("restores a completed journey straight into the persisted garage", async () => {
  const { facade, calls } = createFakeFacade({
    onboarding: {
      onboarding_status: "completed",
      basic_profile_completed: true,
      vehicle_status: "registered",
    },
    vehicles: [
      { id: "v-9", brand: "Honda", model: "Civic", year: 2022, plate: "ABC1D23", nickname: null },
    ],
  });
  const controller = createCustomerJourney(facade, user);
  await controller.restore();
  const state = controller.getState();
  assert.equal(state.status, "ready");
  assert.equal(state.vehicles.length, 1);
  assert.equal(state.vehicles[0].plate, "ABC1D23");
  assert.equal(calls.start, 0);
  assert.equal(calls.list, 1);
});

test("bootstraps the customer identity once when refresh is unauthorized", async () => {
  const { facade, calls, startedNames } = createFakeFacade({
    refreshError: "Customer authorization required",
    refreshFailsUntilStart: true,
  });
  const controller = createCustomerJourney(facade, user);
  await controller.restore();
  assert.equal(calls.start, 1);
  assert.deepEqual(startedNames, ["maria"]);
  assert.equal(controller.getState().status, "basic-profile");
});

test("routes to basic-profile when the basic profile is incomplete", async () => {
  const { facade } = createFakeFacade();
  const controller = createCustomerJourney(facade, user);
  await controller.restore();
  assert.equal(controller.getState().status, "basic-profile");
});

test("routes to vehicle step when profile is done but vehicle is pending", async () => {
  const { facade } = createFakeFacade({
    onboarding: {
      onboarding_status: "in_progress",
      basic_profile_completed: true,
      vehicle_status: "pending",
    },
  });
  const controller = createCustomerJourney(facade, user);
  await controller.restore();
  assert.equal(controller.getState().status, "vehicle");
});

test("fails closed when identity bootstrap is rejected and retry recovers", async () => {
  const overrides = {
    refreshError: "Customer authorization required",
    refreshFailsUntilStart: true,
    startError: "Privileged identities cannot self-enroll",
  };
  const { facade, calls } = createFakeFacade(overrides);
  const controller = createCustomerJourney(facade, user);
  await controller.restore();
  let state = controller.getState();
  assert.equal(state.status, "error");
  assert.equal(state.message, "Privileged identities cannot self-enroll");
  overrides.startError = null;
  await controller.restore();
  assert.equal(controller.getState().status, "basic-profile");
  // Retry refreshes first; the identity bootstrap is only retried when the
  // refresh still reports the missing identity.
  assert.equal(calls.start, 1);
});

test("rejects basic profile without terms acceptance and without RPC", async () => {
  const { facade, calls } = createFakeFacade();
  const controller = createCustomerJourney(facade, user);
  await controller.restore();
  const result = await controller.submitBasicProfile("Maria", false);
  assert.equal(result.ok, false);
  assert.match(result.message, /termos/);
  assert.equal(calls.complete, 0);
  assert.equal(controller.getState().status, "basic-profile");
});

test("rejects an empty display name without RPC", async () => {
  const { facade, calls } = createFakeFacade();
  const controller = createCustomerJourney(facade, user);
  await controller.restore();
  const result = await controller.submitBasicProfile("   ", true);
  assert.equal(result.ok, false);
  assert.equal(calls.complete, 0);
});

test("completes the basic profile and advances to the vehicle step", async () => {
  const { facade, calls } = createFakeFacade();
  const controller = createCustomerJourney(facade, user);
  await controller.restore();
  const result = await controller.submitBasicProfile("Maria Silva", true);
  assert.deepEqual(result, { ok: true });
  assert.equal(calls.complete, 1);
  assert.equal(controller.getState().status, "vehicle");
});

test("surfaces RPC failure on basic profile and stays on the step", async () => {
  const { facade } = createFakeFacade({ completeError: "save_failed" });
  const controller = createCustomerJourney(facade, user);
  await controller.restore();
  const result = await controller.submitBasicProfile("Maria", true);
  assert.deepEqual(result, { ok: false, message: "save_failed" });
  assert.equal(controller.getState().status, "basic-profile");
});

test("rejects an invalid plate locally without calling the RPC", async () => {
  const { facade, calls } = createFakeFacade({
    onboarding: { basic_profile_completed: true, vehicle_status: "pending" },
  });
  const controller = createCustomerJourney(facade, user);
  await controller.restore();
  const result = await controller.confirmVehicle({ ...validVehicle, plate: "AB1234" });
  assert.equal(result.ok, false);
  assert.match(result.message, /Placa inválida/);
  assert.equal(calls.confirm, 0);
});

test("rejects an out-of-range model year locally without calling the RPC", async () => {
  const { facade, calls } = createFakeFacade({
    onboarding: { basic_profile_completed: true, vehicle_status: "pending" },
  });
  const controller = createCustomerJourney(facade, user);
  await controller.restore();
  const result = await controller.confirmVehicle({ ...validVehicle, modelYear: "1800" });
  assert.equal(result.ok, false);
  assert.match(result.message, /ano\/modelo/);
  assert.equal(calls.confirm, 0);
});

test("confirms the vehicle manually and opens the persisted garage", async () => {
  const { facade, getVehicles } = createFakeFacade();
  const controller = createCustomerJourney(facade, user);
  await controller.restore();
  await controller.submitBasicProfile("Maria", true);
  const result = await controller.confirmVehicle(validVehicle);
  assert.deepEqual(result, { ok: true });
  const state = controller.getState();
  assert.equal(state.status, "ready");
  assert.equal(state.vehicles.length, 1);
  assert.equal(state.vehicles[0].plate, "ABC1D23");
  assert.equal(getVehicles()[0].brand, "Honda");
});

test("surfaces a duplicate-vehicle conflict and stays on the vehicle step", async () => {
  const { facade } = createFakeFacade({
    onboarding: { basic_profile_completed: true, vehicle_status: "pending" },
    confirmError: "Confirmed vehicle already exists with different data",
  });
  const controller = createCustomerJourney(facade, user);
  await controller.restore();
  const result = await controller.confirmVehicle(validVehicle);
  assert.deepEqual(result, {
    ok: false,
    message: "Confirmed vehicle already exists with different data",
  });
  assert.equal(controller.getState().status, "vehicle");
});

test("reports garage load failure after a successful confirmation", async () => {
  const { facade } = createFakeFacade({
    onboarding: { basic_profile_completed: true, vehicle_status: "pending" },
    listError: "network down",
  });
  const controller = createCustomerJourney(facade, user);
  await controller.restore();
  const result = await controller.confirmVehicle(validVehicle);
  assert.equal(result.ok, false);
  const state = controller.getState();
  assert.equal(state.status, "error");
  assert.equal(state.message, HOME_LOAD_UNAVAILABLE_MESSAGE);
});

test("normalizeBrazilianPlate accepts both canonical formats", () => {
  assert.equal(normalizeBrazilianPlate("abc-1234"), "ABC1234");
  assert.equal(normalizeBrazilianPlate(" abc1d23 "), "ABC1D23");
  assert.equal(normalizeBrazilianPlate("AB1234"), null);
  assert.equal(normalizeBrazilianPlate("ABC123"), null);
  assert.equal(normalizeBrazilianPlate(""), null);
});

test("prepareVehicleDraft trims optional fields to null", () => {
  const result = prepareVehicleDraft({
    plate: "ABC1234",
    brand: " Toyota ",
    model: " Corolla ",
    modelYear: "2020",
    version: "  ",
    engine: "",
    transmission: undefined,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.draft, {
    plate: "ABC1234",
    brand: "Toyota",
    model: "Corolla",
    modelYear: 2020,
    version: null,
    engine: null,
    transmission: null,
  });
});

test("onboarding terms version matches the canonical #139 contract", () => {
  assert.equal(ONBOARDING_TERMS_VERSION, "pilot-alpha-onboarding-v1");
});

test("defaultDisplayName falls back to the e-mail prefix", () => {
  assert.equal(defaultDisplayName({ id: "u-1", email: "maria.silva@verah.dev" }), "maria.silva");
  assert.equal(defaultDisplayName({ id: "u-2" }), "Cliente VERAH");
});

test("loads expense summaries per vehicle into the ready journey state", async () => {
  const expenseCalls = [];
  const facade = createFakeFacade({
    onboarding: {
      onboarding_status: "completed",
      basic_profile_completed: true,
      vehicle_status: "registered",
    },
    vehicles: [
      { id: "v-1", brand: "Honda", model: "Civic", year: 2022, plate: "ABC1D23", nickname: null },
      { id: "v-2", brand: "Fiat", model: "Uno", year: 2020, plate: "ABC2E34", nickname: null },
    ],
  }).facade;
  facade.expenseForVehicle = async (vehicleId) => {
    expenseCalls.push(vehicleId);
    if (vehicleId === "v-2") return { data: null, error: { message: "rpc down" } };
    return {
      data: {
        total_cents: 158000,
        fuel_cents: 33000,
        maintenance_cents: 120000,
        other_cents: 5000,
        expense_count: 4,
        distance_km:  600,
        cost_per_km_cents:  263.33,
      },
      error: null,
    };
  };
  const controller = createCustomerJourney(facade, user);
  await controller.restore();
  const state = controller.getState();
  assert.equal(state.status, "ready");
  assert.deepEqual(state.expensesByVehicle["v-1"], {
    totalCents: 158000,
    fuelCents:  33000,
    maintenanceCents:  120000,
    otherCents:   5000,
    expenseCount:  4,
    distanceKm:  600,
    costPerKmCents:  263.33,
  });
  assert.equal(state.expensesByVehicle["v-2"], undefined);
  assert.deepEqual(expenseCalls.sort(), ["v-1", "v-2"]);
});

test("mapVehicleExpenseSummary keeps cost-per-km null without a valid odometer base", () => {
  const summary = mapVehicleExpenseSummary({
    total_cents: 2500,
    fuel_cents:  2500,
    maintenance_cents:  0,
    other_cents:   0,
    expense_count:  1,
    distance_km: null,
    cost_per_km_cents: null,
  });
  assert.ok(summary !== null);
  assert.equal(summary.totalCents, 2500);
  assert.equal(summary.distanceKm, null);
  assert.equal(summary.costPerKmCents, null);
  assert.equal(mapVehicleExpenseSummary({ total_cents: "not-a-number" }), null);
  assert.equal(mapVehicleExpenseSummary({}), null);
  assert.equal(mapVehicleExpenseSummary(null), null);
});

test("refreshExpenses reloads summaries for the selected period", async () => {
  const expenseCalls = [];
  const facade = createFakeFacade({
    onboarding: {
      onboarding_status: "completed",
      basic_profile_completed: true,
      vehicle_status: "registered",
    },
    vehicles: [
      { id: "v-1", brand: "Honda", model: "Civic", year: 2022, plate: "ABC1D23", nickname: null },
    ],
  }).facade;
  facade.expenseForVehicle = async (vehicleId, periodDays) => {
    expenseCalls.push({ vehicleId, periodDays: periodDays ?? null });
    return {
      data: {
        total_cents: periodDays === 30 ? 8000 : 158000,
        fuel_cents: periodDays === 30 ? 8000 : 33000,
        maintenance_cents:  0,
        other_cents:   0,
        expense_count:  periodDays === 30 ? 1 : 4,
        distance_km:   periodDays === 30 ? 300 : 600,
        cost_per_km_cents: periodDays === 30 ? 26.67 :  263.33,
      },
      error: null,
    };
  };
  const controller = createCustomerJourney(facade, user);
  await controller.restore();
  let state = controller.getState();
  assert.equal(state.status, "ready");
  assert.equal(state.expensesByVehicle["v-1"].totalCents,158000);
  assert.deepEqual(expenseCalls, [
    { vehicleId: "v-1", periodDays: null },
  ]);
  await controller.refreshExpenses(30);
  state = controller.getState();
  assert.equal(state.expensesByVehicle["v-1"].totalCents,8000);
  assert.equal(state.expensesByVehicle["v-1"].costPerKmCents,26.67);
  assert.deepEqual(expenseCalls, [
    { vehicleId: "v-1", periodDays: null },
    { vehicleId: "v-1", periodDays: 30 },
  ]);
});
