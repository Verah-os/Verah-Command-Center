import assert from "node:assert/strict";
import test from "node:test";

import {
  createCustomerJourney,
} from "../src/customer-journey.ts";

function createFakeFacade(overrides = {}) {
  const calls = { deactivate: 0, replace: 0, confirm: 0, list: 0 };
  let onboarding = overrides.onboarding ?? {
    onboarding_status: "completed",
    basic_profile_completed: true,
    vehicle_status: "registered",
  };
  let vehicles = [
    { id: "v-old", brand: "Honda", model: "Civic", year: 2022, plate: "ABC1234", nickname: null },
    { id: "v-new", brand: "Fiat", model: "Argo", year: 2023, plate: "DEF5678", nickname: null },
  ];
  let activeVehicles = [...vehicles];
  const facade = {
    refreshOnboarding: async () => ({ data: onboarding, error: null }),
    startOnboarding: async () => ({ error: null }),
    completeBasicProfile: async () => ({ error: null }),
    confirmVehicle: async (draft) => {
      calls.confirm += 1;
      const created = {
        id: `v-${calls.confirm}`,
        brand: draft.brand,
        model: draft.model,
        year: draft.modelYear,
        plate: draft.plate,
        nickname: null,
      };
      vehicles.push(created);
      if (!overrides.keepActiveForReplace) {
        activeVehicles.push(created);
      }
      return { error: null };
    },
    deactivateVehicle: async (vehicleId) => {
      calls.deactivate += 1;
      if (overrides.deactivateError) return { error: { message: overrides.deactivateError } };
      activeVehicles = activeVehicles.filter((v) => v.id !== vehicleId);
      return { error: null };
    },
    replaceVehicle: async (vehicleId, replacementVehicleId) => {
      calls.replace += 1;
      if (overrides.replaceError) return { error: { message: overrides.replaceError } };
      activeVehicles = activeVehicles.filter((v) => v.id !== vehicleId);
      if (!activeVehicles.some((v) => v.id === replacementVehicleId)) {
        activeVehicles.push(vehicles.find((v) => v.id === replacementVehicleId));
      }
      return { error: null };
    },
    listVehicles: async () => ({ data: activeVehicles, error: null }),
  };
  return { facade, calls, getActive: () => activeVehicles, getAll: () => vehicles };
}

const user = { id: "u-1", email: "maria@verah.dev" };

test("replacing the vehicle swaps the garage entry while keeping the old row", async () => {
  const { facade, calls } = createFakeFacade();
  const controller = createCustomerJourney(facade, user);
  await controller.restore();
  assert.equal(controller.getState().vehicles.length, 2);
  const result = await controller.replaceVehicle("v-old", "v-new");
  assert.equal(result.ok, true);
  assert.equal(calls.replace, 1);
  assert.deepEqual(
    controller.getState().vehicles.map((v) => v.id),
    ["v-new"],
  );
});

test("deactivation goes through the explicit replacement RPC and preserves history", async () => {
  const { facade, calls, getAll } = createFakeFacade();
  const controller = createCustomerJourney(facade, user);
  await controller.restore();
  const result = await controller.deactivateVehicle("v-old");
  assert.equal(result.ok, true);
  assert.equal(calls.deactivate, 1);
  assert.deepEqual(
    controller.getState().vehicles.map((v) => v.id),
    ["v-new"],
  );
  assert.ok(getAll().length >  controller.getState().vehicles.length, "history must outlive the garage");
});

test("replacement failure surfaces the RPC error while preserving the garage", async () => {
  const { facade } = createFakeFacade({ replaceError: "Replacement vehicle authorization required" });
  const controller = createCustomerJourney(facade, user);
  await controller.restore();
  const result = await controller.replaceVehicle("v-old", "v-new");
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.message, /Replacement vehicle authorization required/);
  assert.equal(controller.getState().vehicles.length, 2);
});

test("deactivation failure surfaces the RPC error while preserving the garage", async () => {
  const { facade } = createFakeFacade({ deactivateError: "Vehicle is already inactive" });
  const controller = createCustomerJourney(facade, user);
  await controller.restore();
  const result = await controller.deactivateVehicle("v-old");
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.message, /Vehicle is already inactive/);
  assert.equal(controller.getState().vehicles.length, 2);
});