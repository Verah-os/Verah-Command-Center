import assert from "node:assert/strict";
import test from "node:test";
import { deriveMaintenanceReminders } from "../src/maintenance.ts";
import { createCustomerJourney } from "../src/customer-journey.ts";

const record = (changes = {}) => ({ id: "1", vehicle_id: "v1", maintenance_type: "óleo", description: "Troca",
  occurred_on: "2026-08-01", odometer_km: 10000, amount_cents: null, next_due_on: null, next_due_km: null, ...changes });
const derive = (records, km = 12000) => deriveMaintenanceReminders(records, "v1", "2026-09-09", km);
test("date and km thresholds are inclusive; either exceeded threshold wins", () => {
  for (const [input, status] of [
    [{ next_due_on: "2026-09-08" }, "overdue"], [{ next_due_on: "2026-09-09" }, "overdue"],
    [{ next_due_on: "2026-10-09" }, "upcoming"], [{ next_due_on: "2026-10-10" }, null],
    [{ next_due_km: 12000 }, "overdue"], [{ next_due_km: 13000 }, "upcoming"],
    [{ next_due_km: 13001 }, null], [{ next_due_on: "2027-01-01", next_due_km: 11000 }, "overdue"],
    [{ next_due_on: "2026-09-08", next_due_km: 20000 }, "overdue"], [{}, null],
  ]) assert.equal(derive([record(input)])[0]?.status ?? null, status);
});
test("missing mileage is unknown, never zero; dates still work", () => {
  assert.deepEqual(derive([record({ next_due_km: 500 })], null), []);
  assert.equal(derive([record({ next_due_on: "2026-09-09", next_due_km: 500 })], null)[0].status, "overdue");
  assert.equal(derive([record({ next_due_km: 0 })], 0)[0].status, "overdue");
});
test("newest maintenance of same type supersedes old reminders, independent of input order", () => {
  const old = record({ next_due_on: "2026-09-01" });
  const latest = record({ id: "2", maintenance_type: " Óleo ", occurred_on: "2026-09-02" });
  assert.deepEqual(derive([old, latest]), []);
  assert.deepEqual(derive([latest, old]), []);
  assert.equal(derive([old, { ...latest, maintenance_type: "pneus" }]).length, 1);
});
test("vehicle isolation, stable ordering, no mutation or wall-clock dependence", () => {
  const records = Object.freeze([Object.freeze(record({ next_due_km: 12500 })),
    Object.freeze(record({ id: "2", vehicle_id: "other", next_due_on: "2026-09-01" }))]);
  assert.equal(derive(records).length, 1);
  assert.deepEqual(derive(records), derive(records));
});
test("journey loads each vehicle separately and distinguishes failed load from no reminders", async () => {
  const facade = {
    refreshOnboarding: async () => ({ data: { basic_profile_completed: true, vehicle_status: "registered" } }),
    listVehicles: async () => ({ data: [{ id: "v1" }, { id: "v2" }] }),
    listMaintenance: async id => id === "v1" ? { data: [record()] } : { error: { message: "offline" } },
  };
  const controller = createCustomerJourney(facade, { id: "u1" });
  await controller.restore();
  assert.deepEqual(controller.getState().maintenanceByVehicle, { v1: [record()], v2: null });
});
test("transport failure retains same maintenance payload and key on retry", async () => {
  const calls = [];
  const controller = createCustomerJourney({
    refreshOnboarding: async () => ({ data: { basic_profile_completed: false } }),
    registerMaintenance: async (id, input) => {
    calls.push({ id, input }); if (calls.length === 1) throw new Error("offline"); return { error: null };
  } }, { id: "u1" });
  const input = { ...record(), idempotency_key: "same", create_expense: true, amount_cents: 1234 };
  assert.equal((await controller.registerMaintenance("v1", input)).ok, false);
  assert.equal((await controller.registerMaintenance("v1", input)).ok, true);
  assert.deepEqual(calls[0], calls[1]);
});
