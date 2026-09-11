import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const DOC = "docs/ship-verah/release-1.0-ios-readiness.md";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const readJson = (path) => JSON.parse(read(path));

function referencedFilePaths(doc) {
  const found = [];
  const re = /`((?:mobile|supabase|docs|lib|tests)\/[^`]+)`/g;
  let m;
  while ((m = re.exec(doc)) !== null) {
    const token = m[1];
    const raw = token.split(" ")[0].split(":")[0].replace(/[()]/g, "");
    if (/\.(ts|tsx|mjs|sql|md|json|sh)$/.test(raw)) {
      found.push(raw);
    }
  }
  return found;
}

test("iOS readiness doc references only existing repository paths", () => {
  const doc = read(DOC);
  const files = referencedFilePaths(doc);
  const missing = files.filter((path) => {
    try {
      readFileSync(new URL(`../${path}`, import.meta.url));
      return false;
    } catch {
      return true;
    }
  });
  assert.deepEqual(missing, [], "paths referenced by the iOS readiness doc do not exist");
});

test("iOS readiness doc stays consistent with the versioned Expo/EAS config", () => {
  const doc = read(DOC);
  const app = readJson("mobile/app.json");
  const eas = readJson("mobile/eas.json");
  assert.equal(app.expo.scheme, "verah-dev");
  assert.ok(doc.includes("verah-dev://auth/callback"), "doc must describe the scheme deep link");
  assert.equal(app.expo.ios.bundleIdentifier, "com.verah.app.dev");
  assert.ok(doc.includes("com.verah.app.dev"), "doc must reference the dev bundle id");
  assert.equal(eas.build["preview-simulator"].ios.simulator, true);
  assert.ok(doc.includes("preview-simulator"), "doc must reference the simulator profile");
});

test("iOS readiness doc keeps scheme/deep-link consistent with mobile source", () => {
  const doc = read(DOC);
  const supabaseSource = read("mobile/src/supabase.ts");
  const authGateSource = read("mobile/src/AuthGate.tsx");
  assert.ok(supabaseSource.includes("verah-dev://auth/callback"), "supabase.ts must use the dev scheme");
  assert.ok(authGateSource.includes("Linking.addEventListener"), "AuthGate must consume deep links");
  assert.ok(doc.includes("handleAuthUrl"), "doc must reference the deep-link handler");
});

test("iOS readiness doc preserves canonical mobile service contracts", () => {
  const doc = read(DOC);
  for (const name of [
    "confirm_customer_vehicle",
    "customer_id",
    "created_by",
    "createMobileServiceRequest",
    "register_vehicle_fuel",
    "register_vehicle_charging",
    "register_vehicle_maintenance",
    "vehicle_expense_summary",
    "service_request",
    "RLS",
  ]) {
    assert.ok(doc.includes(name, "missing canonical contract: " + name));
  }
});

test("iOS readiness doc keeps fuel and charging units distinct", () => {
  const doc = read(DOC);
  assert.match(doc, /litros\s+e\s+kWh/);
  assert.doesNotMatch(doc, /\d+\s*L\s*=\s*\d+\s*kWh/i);
  assert.doesNotMatch(doc, /\d+\s*kWh\s*=\s*\d+\s*L/i);
});

test("iOS readiness doc stays repository-safe and fail-closed", () => {
  const doc = read(DOC);
  for (const clause of ["Human Gate", "banco remoto", "fail-closed", "nenhum banco remoto", "Simulator", "App ID", "assinatura", "provisioning"]) {
    assert.ok(doc.includes(clause, "missing scope clause: " + clause));
  }
  assert.doesNotMatch(doc, /eas\s+(credentials|device)\s+--profile/i);
  assert.doesNotMatch(doc, /eas\s+submit/i);
});