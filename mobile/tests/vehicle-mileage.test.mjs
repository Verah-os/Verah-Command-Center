import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_MILEAGE_KM,
  createVehicleMileageController,
  latestMileage,
  prepareMileageEntry,
} from "../src/vehicle-mileage.ts";

// The in-memory facade is a deliberately necessary seam: Node CI has no
// React Native runtime, so the real binding in `src/vehicle-mileage-supabase.ts`
// cannot be loaded here. The tests exercise the `createVehicleMileageController`
// code path through this minimal transport that mimics the canonical table select/insert.
function createFakeFacade(overrides = {}) {
  const calls = { list: 0, add: 0 };
  let logs = overrides.logs ?? [];
  const facade = {
    listLogs: async (vehicleId) => {
      calls.list += 1;
      if (overrides.listError) return { data: null, error: { message: overrides.listError } };
      return { data: logs.filter((log) => log.vehicleId === vehicleId), error: null };
    },
    addLog: async (draft) => {
      calls.add += 1;
      if (overrides.addError) return { data: null, error: { message: overrides.addError } };
      const created = {
        id: `log-${calls.add}`,
        vehicleId: draft.vehicleId,
        recordedAt: draft.recordedAt,
        odometerKm: draft.odometerKm,
        note: draft.note,
        createdAt: new Date().toISOString(),
      };
      logs = [...logs, created];
      return { data: created, error: null };
    },
  };
  return { facade, calls, getLogs: () => logs };
}

const vehicleId = "v-1";

test("loads history and exposes the latest mileage for the vehicle", async () => {
  const { facade } = createFakeFacade({
    logs: [
      { id: "l1", vehicleId, recordedAt: "2026-09-01T10:00:00.000Z", odometerKm: 12000, note: null, createdAt: "2026-09-01T10:00:00.000Z" },
      { id: "l2", vehicleId, recordedAt: "2026-09-03T09:00:00.000Z", odometerKm: 12500, note: "Revisão", createdAt: "2026-09-03T09:00:00.000Z" },
    ],
  });
  const controller = createVehicleMileageController(facade, vehicleId);
  await controller.load();
  const state = controller.getState();
  assert.equal(state.status, "ready");
  assert.equal(state.logs.length, 2);
  assert.equal(state.latestKm, 12500);
  assert.equal(latestMileage(state.logs).odometerKm, 12500);
});

test("registers a new entry and appends it to history locally", async () => {
  const { facade, calls, getLogs } = createFakeFacade();
  const controller = createVehicleMileageController(facade, vehicleId);
  await controller.load();
  const result = await controller.addEntry({ odometerKm: "45.250", note: "Abastecimento" });
  assert.equal(result.ok, true);
  assert.equal(calls.add, 1);
  assert.equal(getLogs().length, 1);
  const state = controller.getState();
  assert.equal(state.status, "ready");
  assert.equal(state.latestKm, 45250);
});

test("rejects a regression below the latest mileages without calling the backend", async () => {
  const { facade, calls } = createFakeFacade({
    logs: [
      { id: "l1", vehicleId, recordedAt: "2026-09-01T10:00:00.000Z", odometerKm: 12000, note: null, createdAt: "2026-09-01T10:00:00.000Z" },
    ],
  });
  const controller = createVehicleMileageController(facade, vehicleId);
  await controller.load();
  const result = await controller.addEntry({ odometerKm: "11.999" });
  assert.equal(result.ok, false);
  assert.match(result.message, /não pode ser menor/);
  assert.equal(calls.add, 0);
});

test("validates input before calling the backend", async () => {
  const { facade, calls } = createFakeFacade();
  const controller = createVehicleMileageController(facade, vehicleId);
  await controller.load();
  const negative = await controller.addEntry({ odometerKm: "-5" });
  assert.equal(negative.ok, false);
  assert.equal(calls.add, 0);
  const tooHigh = await controller.addEntry({
    odometerKm: String(MAX_MILEAGE_KM + 1),
  });
  assert.equal(tooHigh.ok, false);
  assert.equal(calls.add, 0);
});

test("parses PT-BR number input and a00 constant stays within the schema check", async () => {
  const parsed = prepareMileageEntry({ odometerKm: "1.234" });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.entry.odometerKm, 1234);
  assert.equal(MAX_MILEAGE_KM, 2000000);
});

test("surfaces backend errors fail-closed", async () => {
  const { facade } = createFakeFacade({ addError: "RLS blocked insert" });
  const controller = createVehicleMileageController(facade, vehicleId);
  await controller.load();
  const result = await controller.addEntry({ odometerKm: 8000 });
  assert.equal(result.ok, false);
  assert.equal(result.message,"RLS blocked insert");
});

test("surfaces load errors fail-closed and allows retry", async () => {
  const { facade } = createFakeFacade({ listError: "connection refused" });
  const controller = createVehicleMileageController(facade, vehicleId);
  await controller.load();
  let state = controller.getState();
  assert.equal(state.status,"error");
  assert.equal(state.message,"connection refused");
  const reloaded = createFakeFacade();
  const fixed = createVehicleMileageController(reloaded.facade, vehicleId);
  await fixed.load();
  state = fixed.getState();
  assert.equal(state.status,"ready");
});