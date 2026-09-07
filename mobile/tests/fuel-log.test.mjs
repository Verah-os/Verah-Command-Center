import assert from "node:assert/strict";
import test from "node:test";

import { createCustomerJourney, sortFuelLogs } from "../src/customer-journey.ts";

// The in-memory facade is a deliberately necessary seam: Node CI has no
// React Native runtime, so the real binding in `src/supabase.ts` cannot be
// loaded here. The tests exercise the `createCustomerJourney` fuel flow
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
  const calls = { registerFuel:  0, listFuel:  0 };
  const facade = {
    refreshOnboarding: async () => ({ data: onboarding, error: null }),
    startOnboarding: async () => ({ error: null }),
    completeBasicProfile: async () => ({ error: null }),
    confirmVehicle: async () => ({ error: null }),
    deactivateVehicle: async () => ({ error: null }),
    listVehicles: async () => ({ data: vehicles, error: null }),
    listServiceRequests: async () => ({ data: [], error: null }),
    registerMileage: async () => ({ data: null, error: null }),
    listMileage: async () => ({ data: [], error: null }),
    registerFuel: async (vehicleId, input) => {
      calls.registerFuel += 1;
      if (overrides.registerFuelError) return { data: null, error: { message: overrides.registerFuelError } };
      const log = {
        id: `f-${logs.length + 1}`,
        vehicleId,
        recordedAt: input.recordedAt ?? new Date().toISOString(),
        odometerValue: input.odometerValue,
        liters: input.liters,
        totalAmount: input.totalAmount,
        fuelType: input.fuelType,
        consumptionKmpl: null,
        note: input.note ?? null,
        createdAt: new Date().toISOString(),
      };
      logs.push(log);
      return { data: log, error: null };
    },
    listFuel: async (vehicleId) => {
      calls.listFuel += 1;
      if (overrides.listFuelError) return { data: null, error: { message: overrides.listFuelError } };
      return { data: logs.filter((log) => log.vehicleId === vehicleId), error: null };
    },
  };
  return { facade, calls, getLogs: () => logs };
}

const user = { id: "u-1", email: "maria@verah.dev" };

test("lists empty fuel history for the vehicle", async () => {
  const { facade, calls } = createFakeFacade();
  const controller = createCustomerJourney(facade, user);
 await controller.restore();
  const result = await controller.listFuel("v-1");
  assert.deepEqual(result, { ok: true, data: { logs: [], latest: null, nextMinimum: 0 } });
  assert.equal(calls.listFuel, 1);
});

test("registers fuel and returns the entry", async () => {
  const { facade, calls, getLogs } = createFakeFacade();
  const controller = createCustomerJourney(facade, user);
 await controller.restore();
  const result = await controller.registerFuel("v-1", {
    odometerValue: "85000",
    liters: "40.5",
    totalAmount: "340",
    fuelType: "gasolina",
    note: "  Posto da esquina  ",
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(calls.registerFuel, 1);
  assert.equal(getLogs()[0].odometerValue, 85000);
  assert.equal(getLogs()[0].liters, 40.5);
  assert.equal(getLogs()[0].note, "Posto da esquina");
  assert.equal(getLogs()[0].fuelType, "gasolina");
  const listed = await controller.listFuel("v-1");
  assert.equal(listed.ok, true);
  assert.equal(listed.data.latest.odometerValue, 85000);
  assert.equal(listed.data.nextMinimum, 85000);
});

test("rejects invalid fuel inputs locally without calling the RPC", async () => {
  const { facade, calls } = createFakeFacade();
  const controller = createCustomerJourney(facade, user);
 await controller.restore();
  const badOdometer = await controller.registerFuel("v-1", { odometerValue: "-5", liters: "10", totalAmount: "80", fuelType: "gasolina" });
  assert.equal(badOdometer.ok, false);
  assert.match(badOdometer.message, /hodômetro/);
  const zeroLiters = await controller.registerFuel("v-1", { odometerValue: "100", liters: "0", totalAmount: "80", fuelType: "gasolina" });
  assert.equal(zeroLiters.ok, false);
  assert.match(zeroLiters.message, /litros/);
  const badFuel = await controller.registerFuel("v-1", { odometerValue: "100", liters: "10", totalAmount: "80", fuelType: "hidrogenio" });
  assert.equal(badFuel.ok, false);
  assert.match(badFuel.message, /combustível/);
  const huge = await controller.registerFuel("v-1", { odometerValue: "3000000", liters: "10", totalAmount: "80", fuelType: "gasolina" });
  assert.equal(huge.ok, false);
  assert.equal(calls.registerFuel, 0);
});

test("rejects registry failures and surfaces the RPC message", async () => {
  const { facade, calls } = createFakeFacade({ registerFuelError: "fuel below latest odometer" });
  const controller = createCustomerJourney(facade, user);
 await controller.restore();
  const result = await controller.registerFuel("v-1", { odometerValue: "10", liters: "10", totalAmount: "80", fuelType: "gasolina" });
  assert.equal(result.ok, false);
  assert.equal(result.message, "fuel below latest odometer");
  assert.equal(calls.registerFuel, 1);
});

test("sortFuelLogs sorts by newest recorded_at first", () => {
  const logs = [
    { id: "a", vehicleId: "v-1", recordedAt: "2026-01-10T00:00:00Z", odometerValue: 100, liters:  30, totalAmount:  250, fuelType: "gasolina", consumptionKmpl: null, note: null, createdAt: "2026-01-11T00:00:00Z" },
    { id: "b", vehicleId: "v-1", recordedAt: "2026-02-10T00:00:00Z", odometerValue: 200, liters:  30, totalAmount:  260, fuelType: "etanol", consumptionKmpl:  10, note: null, createdAt: "2026-01-12T00:00:00Z" },
    { id: "c", vehicleId: "v-1", recordedAt: "2026-01-10T00:00:00Z", odometerValue:  150, liters:  30, totalAmount:  250, fuelType: "diesel", consumptionKmpl: null, note: null, createdAt: "2026-01-13T00:00:00Z" },
  ];
  const sorted = sortFuelLogs(logs);
  assert.deepEqual(sorted.map((log) => log.id), ["b", "c", "a"]);
});