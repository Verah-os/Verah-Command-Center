import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const DOC = "docs/ship-verah/release-1.0-m4-distribution-readiness.md";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const readJson = (path) => JSON.parse(read(path));

function referencedFilePaths(doc) {
  const found = [];
  const re = /`((?:mobile|supabase|docs|lib|tests|public|scripts)\/[^`]+)`/g;
  let m;
  while ((m = re.exec(doc)) !== null) {
    const token = m[1];
    const raw = token.split(" ")[0].split(":")[0].replace(/[()]/g, "");
    if (/\.(ts|tsx|mjs|sql|md|json|sh|jpg|png|pptx)$/.test(raw)) {
      found.push(raw);
    }
  }
  return found;
}

test("M4 distribution doc references only existing repository paths", () => {
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
  assert.deepEqual(missing, [], "paths referenced by the M4 distribution doc do not exist");
});

test("M4 distribution doc stays consistent with the versioned Expo/EAS config", () => {
  const doc = read(DOC);
  const app = readJson("mobile/app.json");
  const eas = readJson("mobile/eas.json");
  assert.equal(app.expo.ios.bundleIdentifier, "com.verah.app.dev");
  assert.equal(app.expo.android.package, "com.verah.app.dev");
  assert.ok(app.expo.ios.buildNumber, "app.json must version ios.buildNumber");
  assert.ok(app.expo.android.versionCode >= 1, "app.json must version android.versionCode");
  assert.equal(eas.cli.appVersionSource, "local", "eas.json must read app version from app.json");
  assert.ok(doc.includes("appVersionSource"), "doc must describe the local version source");
  assert.ok(doc.includes("store-preview"), "doc must reference the store-preview profile");
  assert.ok(doc.includes("app-bundle"), "doc must reference the Android AAB build type");
});

test("M4 distribution doc keeps scheme/deep-link consistent with mobile source", () => {
  const doc = read(DOC);
  const supabaseSource = read("mobile/src/supabase.ts");
  const authGateSource = read("mobile/src/AuthGate.tsx");
  assert.ok(supabaseSource.includes("verah-dev://auth/callback"), "supabase.ts must use the dev scheme");
  assert.ok(authGateSource.includes("Linking.addEventListener"), "AuthGate must consume deep links");
  assert.ok(doc.includes("verah-dev"), "doc must reference the dev scheme");
});

test("M4 distribution doc preserves canonical mobile service contracts", () => {
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
    assert.ok(doc.includes(name), "missing canonical contract: " + name);
  }
});

test("M4 distribution doc keeps fuel and charging units distinct", () => {
  const doc = read(DOC);
  assert.match(doc, /litros\s*\(L\)\s+e\s+kWh/);
  assert.doesNotMatch(doc, /\d+\s*L\s*=\s*\d+\s*kWh/i);
  assert.doesNotMatch(doc, /\d+\s*kWh\s*=\s*\d+\s*L/i);
});

test("M4 distribution doc is repository-safe, fail-closed and without external actions", () => {
  const doc = read(DOC);
  const low = doc.toLowerCase();
  for (const clause of ["human gate", "banco remoto", "fail-closed", "nenhuma ação externa", "assinatura", "provisioning"]) {
    assert.ok(low.includes(clause), "missing scope clause: " + clause);
  }
  // Runner invocations (`pnpm dlx eas-cli ...`) may appear only as documented
  // future steps after the human gates, never as something this artifact executes.
  const inlineRefs = [...low.matchAll(/pnpm\s+dlx\s+eas-cli[^\n]*/g)].map((m) => m[0]);
  assert.ok(inlineRefs.length >= 2, "doc must include reproducible post-gate eas-cli commands");
  for (const ref of inlineRefs) {
    const idx = low.indexOf(ref);
    // The preceding prose must place every runner command strictly after a
    // human gate / founder action (login, chosen identifiers, gates, EAS env).
    const window = low.slice(Math.max(0, idx - 200), idx + ref.length + 10);
    assert.match(
      window,
      /(human gate|ap[óo]s|fundador|gate|login eas|vari[áa]veis p[úu]blicas eas)/,
      "eas-cli invocation must be post-human-gate: " + ref,
    );
  }
});