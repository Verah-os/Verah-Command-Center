import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const SMOKE_PACK = "docs/ship-verah/release-1.0-android-physical-smoke.md";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function referencedFilePaths(doc) {
  const found = [];
  const re = /`((?:mobile|supabase|docs|lib|tests)\/[^`]+)`/g;
  let m;
  while ((m = re.exec(doc)) !== null) {
    const token = m[1];
    const raw = token.split(" ")[0].split(":")[0].replace(/[()]/g, "");
    if (/\.(ts|tsx|mjs|sql|md|json)$/.test(raw)) {
      found.push(raw);
    }
  }
  return found;
}

test("smoke pack references only existing repository paths", () => {
  const doc = read(SMOKE_PACK);
  const files = referencedFilePaths(doc);
  const missing = files.filter((path) => {
    try {
      readFileSync(new URL(`../${path}`, import.meta.url));
      return false;
    } catch {
      return true;
    }
  });
  assert.deepEqual(missing, [], "paths referenced by the smoke pack do not exist");
});

test("smoke pack keeps known physical-test regressions explicit", () => {
  const doc = read(SMOKE_PACK);
  for (const marker of ["R1", "R2", "R3", "R4", "R5"]) {
    assert.ok(doc.includes(marker, "regression row missing: " + marker));
  }
});

test("smoke pack preserves canonical service contracts", () => {
  const doc = read(SMOKE_PACK);
  for (const name of [
    "confirm_customer_vehicle",
    "replace_customer_vehicle",
    "register_vehicle_fuel",
    "register_vehicle_charging",
    "register_vehicle_maintenance",
    "vehicle_expense_summary",
    "createMobileServiceRequest",
    "customer_id",
    "created_by",
  ]) {
    assert.ok(doc.includes(name, "missing canonical contract: " + name));
  }
});

test("smoke pack keeps fuel and charging units distinct", () => {
  const doc = read(SMOKE_PACK);
  assert.match(doc, /litros\s+e\s+kWh/);
  assert.doesNotMatch(doc, /\d+\s*L\s*=\s*\d+\s*kWh/i);
  assert.doesNotMatch(doc, /\d+\s*kWh\s*=\s*\d+\s*L/i);
});

test("smoke pack docs stay repository-safe", () => {
  const doc = read(SMOKE_PACK);
  for (const clause of ["Human Gate separado", "banco remoto", "fail-closed"]) {
    assert.ok(doc.includes(clause, "missing scope clause: " + clause));
  }
});
