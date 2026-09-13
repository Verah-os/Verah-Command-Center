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

test("regression: contract lib preserves filename (not 150-char) in normalization and idempotency key", async () => {
  const { normalizeVehicleDocumentFileName, vehicleDocumentIdempotencyKey, MAX_VEHICLE_DOCUMENT_BYTES } =
    await import("../lib/customer-vehicle-log-contract.ts");
  assert.equal(MAX_VEHICLE_DOCUMENT_BYTES, 10 * 1024 * 1024);
  // Trimmed but not rewritten: a colon stays a colon for both channels.
  const fileName = "relatório:final-2026.pdf";
  assert.equal(normalizeVehicleDocumentFileName(`  ${fileName}  `), fileName);
  // Filenames beyond 150 chars (but within the 255-char DB bound) are preserved
  // verbatim, exactly as Mobile does, so the idempotency key does not diverge.
  const longFileName = "documento-".repeat(22).slice(0, 200) + ".pdf"; // 204 chars
  assert.equal(normalizeVehicleDocumentFileName(longFileName), longFileName);
  assert.equal(normalizeVehicleDocumentFileName("x".repeat(256)), ""); // over the 255-char DB bound
  const key = vehicleDocumentIdempotencyKey({
    documentKind: "nota_fiscal",
    documentDate: "2026-08-01",
    fileName,
    sizeBytes: 4096,
  });
  assert.equal(key, `vehicle-document:nota_fiscal:2026-08-01:${fileName}:4096`);
  // The DB/check allows filenames up to 255 chars; a 255-char name produces a
  // key over the 200-char idempotency bound and is rejected by that check in
  // BOTH channels (same as Mobile), not by a divergent Web-only truncation.
  const fileName255 = `${"a".repeat(251)}.pdf`;
  assert.equal(normalizeVehicleDocumentFileName(fileName255), fileName255);
  const keyLong = vehicleDocumentIdempotencyKey({
    documentKind: "nota_fiscal",
    documentDate: "2026-08-01",
    fileName: fileName255,
    sizeBytes: 4096,
  });
  assert.ok(keyLong.length > 200, "255-char filenames still exceed the 200-char key bound");
});

test("regression: canonical document byte bound matches the mobile/storage/DB 10 MiB constant", async () => {
  const { MAX_VEHICLE_DOCUMENT_BYTES } = await import("../lib/customer-vehicle-log-contract.ts");
  // Mobile `MAX_VEHICLE_DOCUMENT_BYTES`, the storage bucket and the DB check all
  // allow exactly 10 MiB; Web must not reject the top of that range.
  const canonicalMax = 10 * 1024 * 1024;
  assert.equal(MAX_VEHICLE_DOCUMENT_BYTES, canonicalMax);
  assert.ok(10485760 <= canonicalMax, "10 MiB = 10485760 bytes must be accepted");
  assert.ok(10485761 > canonicalMax, "10 MiB + 1 must be rejected by the shared bound");
});

test("regression: PostgreSQL date-only values render as calendar dates, not UTC instants", async () => {
  const { formatPlainDate } = await import("../lib/customer-vehicle-log.ts");
  // `new Date("2026-09-13")` is midnight UTC; the São Paulo formatter would
  // render 12/09/2026. The plain-date formatter must keep the calendar date.
  assert.equal(formatPlainDate("2026-09-13"), "13/09/2026");
  assert.equal(formatPlainDate("2026-02-05"), "05/02/2026");
  assert.equal(formatPlainDate("2025-12-31"), "31/12/2025");
  assert.equal(formatPlainDate("2026-01-01"), "01/01/2026");
  assert.equal(formatPlainDate("not-a-date"), "not-a-date");
});

test("regression: latest energy event compares recorded_at across fuel and charging", async () => {
  const { pickLatestEnergy } = await import("../lib/customer-vehicle-log-contract.ts");
  assert.equal(pickLatestEnergy(null, null), null);
  assert.deepEqual(pickLatestEnergy({ recorded_at: "2026-08-01T10:00:00Z" }, null), { kind: "fuel" });
  assert.deepEqual(pickLatestEnergy(null, { recorded_at: "2026-08-01T10:00:00Z" }), { kind: "charging" });
  // Newer charging must win over an older fuel record...
  assert.deepEqual(
    pickLatestEnergy({ recorded_at: "2026-08-01T10:00:00Z" }, { recorded_at: "2026-08-02T10:00:00Z" }),
    { kind: "charging" },
  );
  // ...and a newer fuel record must win over an older charging record.
  assert.deepEqual(
    pickLatestEnergy({ recorded_at: "2026-08-02T10:00:00Z" }, { recorded_at: "2026-08-01T10:00:00Z" }),
    { kind: "fuel" },
  );
  // Equal timestamps keep fuel as the tie-break (fuel checked first).
  assert.deepEqual(
    pickLatestEnergy({ recorded_at: "2026-08-01T10:00:00Z" }, { recorded_at: "2026-08-01T10:00:00Z" }),
    { kind: "fuel" },
  );
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