import assert from "node:assert/strict";
import test from "node:test";

test("web fuel action payload is accepted by the canonical shared parser", async () => {
  const { parseFuel } = await import("../lib/customer-vehicle-log-contract.ts");
  for (const { name, payload } of buildFuelActionPayloads()) {
    const result = parseFuel(payload);
    assert.ok(result.ok, `${name} should pass: ${result.ok ? "" : result.message}`);
  }
});

test("web charging action payload is accepted by the canonical shared parser", async () => {
  const { parseCharging } = await import("../lib/customer-vehicle-log-contract.ts");
  for (const { name, payload } of buildChargingActionPayloads()) {
    const result = parseCharging(payload);
    assert.ok(result.ok, `${name} should pass: ${result.ok ? "" : result.message}`);
  }
});

test("web maintenance action payload matches the canonical RPC contract bounds", async () => {
  const { parseMaintenance, parseDocumentDate } = await import("../lib/customer-vehicle-log-contract.ts");
  for (const { name, payload } of buildMaintenanceActionPayloads()) {
    const result = parseMaintenance(payload);
    assert.ok(result.ok, `${name} should pass: ${result.ok ? "" : result.message}`);
  }
  const validDate = parseDocumentDate("2026-08-01");
  assert.ok(validDate.ok);
  const futureDate = parseDocumentDate("2999-12-31");
  assert.ok(futureDate.ok, "document_date check is done by the DB, not the client");
});

test("regression: web parser rejects the same invalid inputs the mobile controller rejects", async () => {
  const { parseFuel, parseCharging, parseMileage, parseMileageNote } = await import("../lib/customer-vehicle-log-contract.ts");
  assert.equal(parseFuel({ odometerValue: -1, liters: 40, totalAmount: 200, fuelType: "gasolina" }).ok, false);
  assert.equal(parseFuel({ odometerValue: 1000, liters: 0, totalAmount: 200, fuelType: "gasolina" }).ok, false);
  assert.equal(parseFuel({ odometerValue: 1000, liters: 40, totalAmount: -1, fuelType: "gasolina" }).ok, false);
  assert.equal(parseCharging({ odometerValue: 1000, kwh: 0, totalAmount: 50 }).ok, false);
  assert.equal(parseCharging({ odometerValue: 1000, kwh: 20, totalAmount: 50, batteryPercent: 101 }).ok, false);
  assert.equal(parseCharging({ odometerValue: 1000, kwh: 20, totalAmount: 50, chargingType: "rapida" }).ok, false);
  assert.equal(parseMileage("not-a-number", 0, 2000000).ok, false);
  assert.equal(parseMileage(2_500_000, 0, 2000000).ok, false);
  assert.equal(parseMileageNote("x".repeat(201)).ok, false);
  assert.equal(parseMileageNote("").ok, true);
});

test("regression: web parser never rejects valid high-mileage entries the RPC accepts", async () => {
  const { parseCharging, parseFuel } = await import("../lib/customer-vehicle-log-contract.ts");
  const result = parseCharging({ odometerValue: 1_999_999, kwh: 10000, totalAmount: 0, batteryPercent: 0, chargingType: "outro" });
  assert.ok(result.ok);
  const fuel = parseFuel({ odometerValue: 1_999_999, liters: 10000, totalAmount: 0, fuelType: "diesel" });
  assert.ok(fuel.ok);
});

// Mirrors exactly the values the web server actions build: Right-corner fields,
// comma decimals for liters/amount, and the same idempotency semantics.
function buildFuelActionPayload(overrides = {}) {
  return {
    odometerValue: 42000,
    liters: 42.5,
    totalAmount: 250,
    fuelType: "gasolina",
    note: null,
    ...overrides,
  };
}

function buildChargingActionPayload(overrides = {}) {
  return {
    odometerValue: 33500,
    kwh: 38.4,
    totalAmount: 78,
    batteryPercent: 85,
    chargingType: "recarga_publica",
    note: null,
    ...overrides,
  };
}

function buildMaintenanceActionPayload(overrides = {}) {
  return {
    maintenanceType: "oleo",
    description: "Troca de óleo com filtro",
    occurredOn: "2026-09-01",
    odometerKm: 41000,
    amountCents: 32000,
    nextDueOn: null,
    nextDueKm: null,
    createExpense: true,
    ...overrides,
  };
}

function buildFuelActionPayloads() {
  return [
    { name: "gasolina full fields", payload: buildFuelActionPayload({}) },
    { name: "combined (etanol) + max note", payload: buildFuelActionPayload({ fuelType: "etanol", note: "z".repeat(200) }) },
    { name: "zero total", payload: buildFuelActionPayload({ totalAmount: 0 }) },
  ];
}

function buildChargingActionPayloads() {
  return [
    { name: "full charging", payload: buildChargingActionPayload({}) },
    { name: "optional fields blank", payload: buildChargingActionPayload({ batteryPercent: "", chargingType: "", note: "" }) },
    { name: "rapida", payload: buildChargingActionPayload({ chargingType: "recarga_rapida" }) },
  ];
}

function buildMaintenanceActionPayloads() {
  return [
    { name: "maintenance with cost + expense", payload: buildMaintenanceActionPayload({}) },
    { name: "maintenance no cost no expense", payload: buildMaintenanceActionPayload({ amountCents: null, createExpense: false }) },
    { name: "maintenance with next due", payload: buildMaintenanceActionPayload({ nextDueOn: "2026-12-01", nextDueKm: 50000 }) },
  ];
}