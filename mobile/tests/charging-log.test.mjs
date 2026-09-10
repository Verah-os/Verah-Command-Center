import assert from "node:assert/strict";
import test from "node:test";

import { createCustomerJourney, sortChargingLogs } from "../src/customer-journey.ts";

// The in-memory facade is a deliberately necessary seam: Node CI has no
// React Native runtime, so the real binding in `src/supabase.ts` cannot be
// loaded here. The tests exercise the charging flow through `createCustomerJourney`
// (validation, RPC transport, sorting, latest/nextMinimum derivation)
// with unit-correct kWh semantics, never converting between kWh and liters.

function createFakeFacade(overrides = {}) {
  const onboarding = {
    onboarding_status: "completed",
    basic_profile_completed: true,
    vehicle_status: "registered",
  };
  const vehicles = [
    { id: "v-1", brand: "Honda", model: "Civic", year: 2022, plate: "ABC1D23", nickname: null },
  ];
  const fuelLogs = [];
  const chargingLogs = [];
  const calls = { registerFuel:  0, listFuel:  0, registerCharging:  0, listCharging:  0 };
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
      const log = {
        id: `f-${fuelLogs.length + 1}`,
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
      fuelLogs.push(log);
      return { data: log, error: null };
    },
    listFuel: async (vehicleId) => {
      calls.listFuel += 1;
      return { data: fuelLogs.filter((log) => log.vehicleId === vehicleId), error: null };
    },
    registerCharging: async (vehicleId, input) => {
      calls.registerCharging += 1;
      if (overrides.registerChargingError) return { data: null, error: { message: overrides.registerChargingError } };
      const log = {
        id: `c-${chargingLogs.length + 1}`,
        vehicleId,
        recordedAt: input.recordedAt ?? new Date().toISOString(),
        odometerValue: input.odometerValue,
        kwh: input.kwh,
        totalAmount: input.totalAmount,
        batteryPercent: input.batteryPercent ?? null,
        chargingType: input.chargingType ?? null,
        consumptionKmKwh: null,
        note: input.note ?? null,
        createdAt: new Date().toISOString(),
      };
      chargingLogs.push(log);
      return { data: log, error: null };
    },
    listCharging: async (vehicleId) => {
      calls.listCharging += 1;
      if (overrides.listChargingError) return { data: null, error: { message: overrides.listChargingError } };
      return { data: chargingLogs.filter((log) => log.vehicleId === vehicleId), error: null };
    },
  };
  return { facade, calls, getLogs: () => chargingLogs };
}

const user = { id: "u-1", email: "maria@verah.dev" };

test("lists empty charging history for the vehicle", async () => {
  const { facade, calls } = createFakeFacade();
  const controller = createCustomerJourney(facade, user);
 await controller.restore();
  const result = await controller.listCharging("v-1");
  assert.deepEqual(result, { ok: true, data: { logs: [], latest: null, nextMinimum: 0 } });
  assert.equal(calls.listCharging, 1);
});

test("registers EV charging entry with kWh semantics and nullable battery/type", async () => {
  const { facade, calls, getLogs } = createFakeFacade();
  const controller = createCustomerJourney(facade, user);
 await controller.restore();
  const result = await controller.registerCharging("v-1", {
    odometerValue: "85200",
    kwh: "38.4",
    totalAmount: "98.6",
    batteryPercent: "87",
    chargingType: "recarga_rapida",
    note: "  Posto rápido da BR-101  ",
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(calls.registerCharging,  1);
  assert.equal(getLogs()[0].kwh, 38.4);
  assert.equal(getLogs()[0].totalAmount, 98.6);
  assert.equal(getLogs()[0].batteryPercent, 87);
  assert.equal(getLogs()[0].chargingType, "recarga_rapida");
  assert.equal(getLogs()[0].note, "Posto rápido da BR-101");
   const listed = await controller.listCharging("v-1");
  assert.equal(listed.ok, true);
  assert.equal(listed.data.latest.odometerValue, 85200);
  assert.equal(listed.data.nextMinimum, 85200);
});

test("charging entry without battery/type stays null and keeps kWh unit", async () => {
  const { facade, getLogs } = createFakeFacade();
  const controller = createCustomerJourney(facade, user);
 await controller.restore();
  const result = await controller.registerCharging("v-1", {
    odometerValue: "85300",
    kwh: "22",
    totalAmount: "45",
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(getLogs()[0].batteryPercent, null);
  assert.equal(getLogs()[0].chargingType, null);
  assert.equal(getLogs()[0].kwh, 22);
  assert.equal(getLogs()[0].totalAmount, 45);
});

test("rejects invalid charging inputs locally without calling the RPC", async () => {
  const { facade, calls } = createFakeFacade();
  const controller = createCustomerJourney(facade, user);
 await controller.restore();
  const badOdometer = await controller.registerCharging("v-1", { odometerValue: "-5", kwh: "20", totalAmount: "45" });
  assert.equal(badOdometer.ok, false);
  assert.match(badOdometer.message, /hodômetro/);
  const zeroKwh = await controller.registerCharging("v-1", { odometerValue: "100", kwh: "0", totalAmount: "45" });
  assert.equal(zeroKwh.ok, false);
  assert.match(zeroKwh.message, /kWh/);
  const badBattery = await controller.registerCharging("v-1", { odometerValue: "100", kwh: "20", totalAmount: "45", batteryPercent: "101" });
  assert.equal(badBattery.ok, false);
  assert.match(badBattery.message, /percentual/);
   const badType = await controller.registerCharging("v-1", { odometerValue: "100", kwh: "20", totalAmount: "45", chargingType: "recarga_lua" });
  assert.equal(badType.ok, false);
  assert.match(badType.message, /tipo de recarga/);
  const huge = await controller.registerCharging("v-1", { odometerValue: "3000000", kwh: "20", totalAmount: "45" });
  assert.equal(huge.ok, false);
  assert.equal(calls.registerCharging, 0);
});

test("rejects registry failures and surfaces the RPC message", async () => {
  const { facade, calls } = createFakeFacade({ registerChargingError: "charging below latest odometer" });
  const controller = createCustomerJourney(facade, user);
 await controller.restore();
  const result = await controller.registerCharging("v-1", { odometerValue: "10", kwh: "20", totalAmount: "45" });
  assert.equal(result.ok, false);
  assert.equal(result.message, "charging below latest odometer");
  assert.equal(calls.registerCharging, 1);
});

test("hybrid vehicle keeps fuel and charging as separate unit-correct records", async () => {
  const { facade, calls, getLogs } = createFakeFacade();
  const controller = createCustomerJourney(facade, user);
 await controller.restore();
  await controller.registerFuel("v-1", { odometerValue: "85000", liters: "40", totalAmount: "340", fuelType: "gasolina" });
  await controller.registerCharging("v-1", { odometerValue: "85200", kwh: "38", totalAmount: "98", chargingType: "recarga_publica" });
  assert.equal(calls.registerFuel, 1);
  assert.equal(calls.registerCharging,  1);
  const fuel = await controller.listFuel("v-1");
  const charging = await controller.listCharging("v-1");
  assert.equal(fuel.data.logs[0].liters, 40);
  assert.equal(charging.data.logs[0].kwh, 38);
  assert.equal(fuel.data.logs[0].kwh, undefined);
  assert.equal(charging.data.logs[0].liters, undefined);
});

test("sortChargingLogs sorts by newest recorded_at first", () => {
  const logs = [
    { id: "a", vehicleId: "v-1", recordedAt: "2026-01-10T00:00:00Z", odometerValue: 100, kwh:  30, totalAmount:  60, batteryPercent: null, chargingType: null, consumptionKmKwh: null, note: null, createdAt: "2026-01-11T00:00:00Z" },
    { id: "b", vehicleId: "v-1", recordedAt: "2026-02-10T00:00:00Z", odometerValue: 200, kwh:  30, totalAmount:  60, batteryPercent: null, chargingType: null, consumptionKmKwh:  6.5, note: null, createdAt: "2026-01-12T00:00:00Z" },
    { id: "c", vehicleId: "v-1", recordedAt: "2026-01-10T00:00:00Z", odometerValue:  150, kwh:  30, totalAmount:  60, batteryPercent: null, chargingType: null, consumptionKmKwh: null, note: null, createdAt: "2026-01-13T00:00:00Z" },
  ];
  const sorted = sortChargingLogs(logs);
  assert.deepEqual(sorted.map((log) => log.id), ["b", "c", "a"]);
});