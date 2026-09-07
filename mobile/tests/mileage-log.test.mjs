import assert from "node:assert/strict";
import test from "node:test";

import { createCustomerJourney, sortMileageLogs } from "../src/customer-journey.ts";

// The in-memory facade is a deliberately necessary seam: Node CI has no
// React Native runtime, so the real binding in `src/supabase.ts` cannot be
// loaded here. The tests exercise the `createCustomerJourney` mileage flow
// (validation, RPC transport, sorting, latest/nextMinimum derivation)
// through this minimal transport.

function createFakeFacade(overrides = {}) {
  let onboarding = overrides.onboarding ?? {
    onboarding_status: "completed",
    basic_profile_completed: true,
    vehicle_status: "registered",
  };
  const vehicles = overrides.vehicles ?? [
    { id: "v-1", brand: "Honda", model: "Civic", year: 2022, plate: "ABC1D23", nickname: null },
  ];
  const logs = [];
  const calls = { registerMileage: 0, listMileage: 0 };
  const facade = {
    refreshOnboarding: async () => ({ data: onboarding, error: null }),
    startOnboarding: async () => ({ error: null }),
    completeBasicProfile: async () => ({ error: null }),
    confirmVehicle: async () => ({ error: null }),
    deactivateVehicle: async () => ({ error: null }),
    listVehicles: async () => ({ data: vehicles, error: null }),
    listServiceRequests: async () => ({ data: [], error: null }),
    registerMileage: async (vehicleId, input) => {
      calls.registerMileage += 1;
      if (overrides.registerMileageError) return { data: null, error: { message: overrides.registerMileageError } };
      const log = {
        id: `m-${logs.length + 1}`,
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
  return { facade, calls, getLogs: () => logs };
}

const user = { id: "u-1", email: "maria@verah.dev" };

test("lists empty mileage history for the vehicle", async () => {
  const { facade, calls } = createFakeFacade();
  const controller = createCustomerJourney(facade, user);
  await controller.restore();
  const result = await controller.listMileage("v-1");
  assert.deepEqual(result, { ok: true, data: { logs: [], latest: null, nextMinimum: 0 } });
  assert.equal(calls.listMileage, 1);
});

test("registers mileage and returns latest reading", async () => {
  const { facade, calls, getLogs } = createFakeFacade();
  const controller = createCustomerJourney(facade, user);
 await controller.restore();
  const result = await controller.registerMileage("v-1", { mileageValue: "85000", note: "  Revisão  " });
  assert.deepEqual(result, { ok: true });
 assert.equal(calls.registerMileage, 1);
 assert.equal(getLogs()[0].mileageValue, 85000);
 assert.equal(getLogs()[0].note, "Revisão");
 const listed = await controller.listMileage("v-1");
 assert.equal(listed.ok, true);
 assert.equal(listed.data.latest.mileageValue, 85000);
 assert.equal(listed.data.nextMinimum, 85000);
});

test("rejects invalid mileage locally without calling the RPC", async () => {
  const { facade, calls } = createFakeFacade();
  const controller = createCustomerJourney(facade, user);
 await controller.restore();
  const negative = await controller.registerMileage("v-1", { mileageValue: "-5" });
  assert.equal(negative.ok, false);
  assert.match(negative.message, /quilometragem/);
  const fractional = await controller.registerMileage("v-1", { mileageValue: "12.5" });
  assert.equal(fractional.ok, false);
 const huge = await controller.registerMileage("v-1", { mileageValue: "3000000" });
 assert.equal(huge.ok, false);
 assert.equal(calls.registerMileage, 0);
});

test("rejects registry failures and surfaces the RPC message", async () => {
  const { facade, calls } = createFakeFacade({ registerMileageError: "mileage below latest reading" });
  const controller = createCustomerJourney(facade, user);
 await controller.restore();
  const result = await controller.registerMileage("v-1", { mileageValue: "10" });
  assert.equal(result.ok, false);
 assert.equal(result.message, "mileage below latest reading");
 assert.equal(calls.registerMileage, 1);
});

test("sortMileageLogs sorts by newest recorded_at first", () => {
  const logs = [
    { id: "a", vehicleId: "v-1", recordedAt: "2026-01-10T00:00:00Z", mileageValue: 100, note: null, createdAt: "2026-01-11T00:00:00Z" },
    { id: "b", vehicleId: "v-1", recordedAt: "2026-02-10T00:00:00Z", mileageValue: 200, note: null, createdAt: "2026-01-12T00:00:00Z" },
    { id: "c", vehicleId: "v-1", recordedAt: "2026-01-10T00:00:00Z", mileageValue: 150, note: null, createdAt: "2026-01-13T00:00:00Z" },
  ];
  const sorted = sortMileageLogs(logs);
assert.deepEqual(sorted.map((log) => log.id), ["b", "c", "a"]);
});
