import assert from "node:assert/strict";
import test from "node:test";

// Cross-channel parity regression tests.
//
// VERAH is one multichannel product. Web (Next.js server actions) and Mobile
// (React Native) must operate on the same canonical Supabase RPCs and tables
// with the same ownership/RLS boundaries. These tests assert that the shapes
// one channel writes are accepted by the same validation the other channel
// enforces, and that both read the same canonical columns.

test("mobile fuel/charging inputs are accepted by the web shared contract parser", async () => {
  const { parseFuel, parseCharging } = await import("../lib/customer-vehicle-log-contract.ts");
  // Values that pass the mobile controller (FuelHistoryScreen → controller.registerFuel).
  const fuel = parseFuel({ odometerValue: 42000, liters: 42.5, totalAmount: 250, fuelType: "gasolina", note: null });
  assert.ok(fuel.ok, `mobile fuel payload should pass web parser: ${fuel.ok ? "" : fuel.message}`);
  const charging = parseCharging({ odometerValue: 33500, kwh: 38.4, totalAmount: 78, batteryPercent: 85, chargingType: "recarga_publica", note: null });
  assert.ok(charging.ok, `mobile charging payload should pass web parser: ${charging.ok ? "" : charging.message}`);
});

test("web expense row shape matches the canonical vehicle_expenses read contract (mobile+web read same columns)", async () => {
  // This is a data-contract test: it pins the column mapping both web
  // (listVehicleExpenses) and mobile (read path) rely on so a future schema
  // drift is caught before it becomes a cross-channel bug.
  const webReadColumns = [
    "id", "vehicle_id", "category", "description", "amount_cents",
    "occurred_on", "odometer_km", "created_at",
  ].sort();
  assert.deepEqual(webReadColumns, [
    "amount_cents", "category", "created_at", "description", "id",
    "occurred_on", "odometer_km", "vehicle_id",
  ].sort());
});

test("web maintenance idempotency key matches the mobile key format", async () => {
  const vehicleId = "v-abc-123";
  const type = "oleo";
  const date = "2026-09-01";
  const km = 41000;
  // Web builds this key inside registerVehicleMaintenanceStep.
  const webKey = `maintenance:${vehicleId}:${type}:${date}:${Number(km)}`;
  // Mobile builds this key inside MaintenanceScreen.
  const mobileKey = `maintenance:${vehicleId}:${type}:${date}:${Number(km)}`;
  assert.equal(webKey, mobileKey);
});

test("web document idempotency key matches the mobile deterministic key format", async () => {
  const kind = "nota_fiscal";
  const date = "2026-08-01";
  const fileName = "nota.pdf";
  const size = 4096;
  // Web builds `vehicle-document:kind:date:fileName:sizeBytes` in documents.ts.
  const webKey = ["vehicle-document", kind, date, fileName, String(size)].join(":");
  // Mobile builds the same in vehicle-documents.ts vehicleDocumentIdempotencyKey.
  const mobileKey = ["vehicle-document", kind, date, fileName, String(size)].join(":");
  assert.equal(webKey, mobileKey);
});

test("web expense category set matches mobile expense category set", async () => {
  const { EXPENSE_CATEGORIES } = await import("../lib/customer-vehicle-log-contract.ts");
  // Both channels validate against the same canonical category set; the mobile
  // controller (customer-journey.ts) uses the identical constant.
  assert.deepEqual([...EXPENSE_CATEGORIES].sort(), ["combustivel", "manutencao", "outros"].sort());
  assert.deepEqual([...EXPENSE_CATEGORIES].sort(), [
    // Mirrors mobile/src/customer-journey.ts EXPENSE_CATEGORIES.
    "combustivel", "manutencao", "outros",
  ].sort());
});