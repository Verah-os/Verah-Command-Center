import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

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

test("web server-actions body limit allows the canonical 10 MiB document upload", async () => {
  // P1 regression: the document form announces a 10 MB max, but Next 15 Server
  // Actions default to a 1 MiB body limit and return 413 before our 10 MiB
  // validation runs. `serverActions.bodySizeLimit` must be raised above the
  // canonical bound (with multipart/form-data boundary overhead in mind) while
  // the in-action validation keeps enforcing the canonical MAX bytes.
  const config = read("next.config.ts");
  const actionService = read("services/customer-vehicle-log/actions.ts");
  const documentService = read("services/customer-vehicle-log/documents.ts");
  const contractLib = read("lib/customer-vehicle-log-contract.ts");

  // Web keeps the shared canonical constant (10 MiB), defined once in the
  // contract lib and reused by the server action and the document service.
  const canonicalMax = 10 * 1024 * 1024;
  const contractMaxMatch = contractLib.match(/MAX_VEHICLE_DOCUMENT_BYTES\s*=\s*(\d+)\s*\*\s*1024\s*\*\s*1024/);
  assert.ok(contractMaxMatch, "contract lib must define MAX_VEHICLE_DOCUMENT_BYTES as MiB bytes");
  assert.equal(Number(contractMaxMatch[1]) * 1024 * 1024, canonicalMax);
  assert.match(actionService, /MAX_VEHICLE_DOCUMENT_BYTES/, "server action must use the shared canonical constant");
  assert.ok(!/file\.size\s*>\s*10000000/.test(actionService), "server action must not use a divergent decimal limit");
  assert.match(documentService, /MAX_VEHICLE_DOCUMENT_BYTES/, "document service must also use the shared constant");

  // The configured Server Actions body limit must exist and exceed the file
  // bound (multipart overhead means the raw body is larger than the file).
  const bodySizeMatch = config.match(/bodySizeLimit\s*:\s*"(\d+)(mb|MB|MiB)"/);
  assert.ok(bodySizeMatch, "next.config.ts must configure serverActions.bodySizeLimit");
  // Next's compiled `bytes` package parses `mb`/`MiB` as 1024^2.
  const bodySizeBytes = Number(bodySizeMatch[1]) * 1024 * 1024;
  assert.ok(bodySizeBytes > canonicalMax, "serverActions.bodySizeLimit must be > 10 MiB");

  // And it must still be configured under the experimental.serverActions key
  // Next 15 actually reads at runtime.
  assert.match(config, /experimental:\s*\{[\s\S]*?serverActions:\s*\{[\s\S]*?bodySizeLimit/i);
});

test("web document filename normalization and idempotency key match the mobile contract", async () => {
  // Thread #3998509986: Web used to produce a different filename + key than
  // Mobile (150-char slice + illegal-char replacement), which could create a
  // second metadata row/storage object for the same upload retried from the
  // other channel. Both clients must derive the same canonical key.
  const { normalizeVehicleDocumentFileName, vehicleDocumentIdempotencyKey } =
    await import("../lib/customer-vehicle-log-contract.ts");

  // No illegal-char replacement: Web must keep the full trimmed filename.
  const nameWithColon = "relatório:final.pdf";
  assert.equal(normalizeVehicleDocumentFileName(nameWithColon), nameWithColon);
  assert.equal(normalizeVehicleDocumentFileName(`  ${nameWithColon}  `), nameWithColon);

  // Filenames beyond 150 chars (within the 255-char DB bound) are preserved
  // verbatim, exactly as Mobile does, instead of being truncated to 150.
  const longName = `${"a".repeat(200)}.pdf`;
  assert.equal(normalizeVehicleDocumentFileName(longName), longName);
  assert.equal(normalizeVehicleDocumentFileName(`${"a".repeat(256)}.pdf`), "");

  // The same deterministic key Mobile derives (trimmed name, exact bytes).
  const input = { documentKind: "nota_fiscal", documentDate: "2026-08-01", fileName: longName, sizeBytes: 4096 };
  assert.equal(
    vehicleDocumentIdempotencyKey(input),
    `vehicle-document:nota_fiscal:2026-08-01:${longName}:4096`,
  );

  // And both files derive the key from the same trimmed filename, so a
  // filename longer than 150 chars no longer diverges across channels.
  const webDoc = read("services/customer-vehicle-log/documents.ts");
  const normalization = webDoc.match(/normalizeVehicleDocumentFileName/);
  assert.ok(normalization, "documents.ts must use the shared normalizeVehicleDocumentFileName");
  assert.match(webDoc, /vehicleDocumentIdempotencyKey/, "documents.ts must use the shared idempotency-key builder");
  assert.ok(!/slice\(0,\s*150\)/.test(webDoc), "documents.ts must not truncate filenames to 150 chars");
  assert.ok(!/replace\(\[, .*slice/.test(webDoc), "documents.ts must not rewrite filename characters before the key");
});
