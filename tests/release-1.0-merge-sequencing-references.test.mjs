import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const DOC = "docs/ship-verah/release-1.0-merge-sequencing.md";
const HANDOFF = "docs/handoffs/2026-09-11-issue-249-merge-sequencing-map.md";
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

// Live snapshot taken from the GitHub API on 2026-09-12: the 7 original Release 1.0
// Drafts (#236/#239/#240/#242/#244/#246/#248) merged into main (c71ec30), along with #256.
// The live open Draft PR set is now #250 (this PR), #254, #255, #258. This test asserts only
// repository-local consistency (no network, no credentials).
const LANDED_PRS = {
  236: ["app/(command)/clientes/[id]/loading.tsx", "app/(command)/clientes/[id]/not-found.tsx", "app/(command)/clientes/[id]/page.tsx", "app/(command)/clientes/error.tsx", "app/(command)/clientes/loading.tsx", "app/(command)/clientes/page.tsx", "app/(command)/dashboard/page.tsx", "components/app-shell.tsx", "components/customer-crm/dashboard-metrics.tsx", "components/customer-crm/panels.tsx", "docs/customer-crm-v1.md", "modules/registry.ts", "services/customer-crm/read-model.ts", "services/customer-crm/service.ts", "tests/customer-crm.test.mjs", "vercel.json"],
  239: ["docs/alpha-5-operations-runbook.md", "docs/handoffs/2026-09-10-issue-237-alpha5-runbook-readiness.md"],
  240: ["docs/crm-leads-v0.md"],
  242: ["docs/customer-360-telemetry-v1.md", "scripts/ci/test-database.sh", "supabase/tests/customer_360_telemetry_read.sql"],
  244: ["mobile/src/FuelHistoryScreen.tsx", "mobile/src/customer-journey.ts", "mobile/tests/customer-journey.test.mjs", "mobile/tests/telemetry-availability.test.mjs"],
  246: ["docs/ship-verah/release-1.0-android-physical-smoke.md", "tests/android-smoke-pack-references.test.mjs"],
  248: ["docs/handoffs/2026-09-11-issue-247-ios-readiness.md", "docs/ship-verah/release-1.0-ios-readiness.md", "tests/ios-readiness-references.test.mjs"],
  256: ["docs/ship-verah/release-1.0-staging-migrations-runbook.md", "tests/staging-migrations-sequence.test.mjs"],
};
const OPEN_PRS = {
  250: ["docs/handoffs/2026-09-11-issue-249-merge-sequencing-map.md", "docs/ship-verah/release-1.0-merge-sequencing.md", "tests/release-1.0-merge-sequencing-references.test.mjs"],
  254: ["docs/handoffs/2026-09-11-issue-251-ux-accessibility-pack.md", "docs/ship-verah/release-1.0-ux-accessibility-pack.md", "mobile/App.tsx", "mobile/src/fipe-catalog.ts", "mobile/src/service-request-supabase.ts", "mobile/src/vehicle-documents.ts", "mobile/tests/vehicle-documents.test.mjs", "tests/release-1.0-ux-accessibility-copy-references.test.mjs"],
  255: ["app/(command)/concierge/[id]/page.tsx", "app/(command)/concierge/novo-atendimento/page.tsx", "app/(command)/concierge/page.tsx", "app/(command)/settings/commercial/page.tsx", "app/demo/cliente/atendimento/[id]/page.tsx", "app/demo/cliente/garantias/page.tsx", "app/demo/cliente/historico/page.tsx", "app/demo/cliente/novo-atendimento/page.tsx", "app/demo/cliente/page.tsx", "app/demo/cliente/veiculo/[id]/page.tsx", "app/demo/cliente/veiculos/page.tsx", "app/demo/concierge/loading.tsx", "app/demo/concierge/page.tsx", "app/demo/page.tsx", "app/demo/prestador/atendimento/[id]/page.tsx", "app/demo/prestador/page.tsx", "app/demo/whatsapp/page.tsx", "app/demo/whatsapp/submit-button.tsx", "app/entrar/cliente/cadastro/page.tsx", "app/entrar/cliente/page.tsx", "app/entrar/concierge/page.tsx", "app/entrar/prestador/cadastro/page.tsx", "app/entrar/prestador/page.tsx", "app/globals.css", "app/onboarding/cliente/page.tsx", "app/onboarding/prestador/page.tsx", "components/concierge/demo-decision-panel.tsx", "components/concierge/provider-assignment-form.tsx", "components/concierge/provider-trust-panel.tsx", "components/customer/customer-shell.tsx", "components/customer/vehicle-edit-form.tsx", "components/demo/customer-answers-form.tsx", "components/demo/quote-form.tsx", "components/demo/service-request-form.tsx", "docs/design-system-v1.md", "mobile/src/AuthGate.tsx", "mobile/src/AuthScreen.tsx", "mobile/src/CustomerHome.tsx", "mobile/src/CustomerJourney.tsx", "mobile/src/CustomerRequests.tsx", "mobile/src/MaintenanceScreen.tsx", "mobile/src/MileageHistoryScreen.tsx", "mobile/src/VehicleDocumentsScreen.tsx", "mobile/src/VehicleOnboardingStep.tsx", "next-env.d.ts", "tailwind.config.ts"],
  258: ["docs/handoffs/2026-09-11-issue-257-integration-map-refresh.md", "docs/ship-verah/release-1.0-integration-map-refresh-254-255-256.md", "tests/release-1.0-integration-map-refresh-references.test.mjs"],
};
const ALL = Object.assign({}, LANDED_PRS, OPEN_PRS);
const ALL_OWNERS = Object.keys(ALL).map(Number);
const ALL_PATHS = new Set(Object.values(ALL).flat());
const OPEN_KEYS = Object.keys(OPEN_PRS).map(Number);

test("merge sequencing doc and handoff exist", async () => {
  await read(DOC);
  await read(HANDOFF);
});

test("all 12 ownership sets (landed+open) are pairwise collision-free (zero file overlap)", () => {
  for (let i =  0; i < ALL_OWNERS.length; i++) {
    for (let j = i + 1; j < ALL_OWNERS.length; j++) {
      const a = new Set(ALL[ALL_OWNERS[i]]);
      const b = new Set(ALL[ALL_OWNERS[j]]);
      const inter = [...a].filter((p) => b.has(p));
      assert.deepEqual(inter, [], `#${ALL_OWNERS[i]} and #${ALL_OWNERS[j]} share files`);
    }
  }
});

test("every open Draft PR file path is spelled out in the merge map", async () => {
  const doc = await read(DOC);
  const missing = [...ALL_PATHS].filter((p) => !doc.includes(p));
  assert.deepEqual(missing, [], "open Draft PR paths not listedin the merge map");
});

test("merge sequencing doc references every open Draft PR and the canonical context", async () => {
  const doc = await read(DOC);
  for (const n of OPEN_KEYS.concat([164, 228, 229, 233, 234, 236, 239, 240, 242, 244, 246, 248, 256, 83])) {
    assert.ok(doc.includes(`#${n}`), `doc missing reference to #${n}`);
  }
  assert.ok(doc.includes("Draft"), "doc must state draft scope");
  assert.ok(doc.includes("merge"), "doc must discuss merge sequencing");
});

test("merge sequencing doc states each PR's file countand the recommended order", async () => {
  const doc = await read(DOC);
  for (const n of OPEN_KEYS) {
    assert.ok(doc.includes(`| #${n} |`), `matrix row for #${n} missing`);
    assert.ok(doc.includes(`${OPEN_PRS[n].length} `), `file count for #${n} missing`);
  }
  assert.ok(doc.includes("c71ec30"), "current main base SHA missing");
  for (const sha of ["c459b27", "e95c53f", "be65bcb", "981ef0b", "8c04e4c", "bd90691", "3afe690"]) {
    assert.ok(doc.includes(sha, "missing merged context SHA: " + sha));
  }
  assert.match(
    doc,
/#250\s*`?\s*→\s*`?\s*#254\s*`?\s*→\s*`?\s*#255\s*`?\s*→\s*`?\s*#258/,
    "deterministic merge order missing",
  );
});

test("merge sequencing doc reports every open Draft PR as behind but CI-green", async () => {
  const doc = await read(DOC);
  assert.ok(doc.includes("mergeable_state: behind"), "doc must report behind state");
  assert.ok(doc.includes("Required"), "doc must mention CI Required");
  assert.ok(doc.includes("success"), "doc must mention CI success");
});

test("merge sequencing doc preserves canonical contractsand unit separation", async () => {
  const doc = await read(DOC);
  for (const name of [
    "customer_id",
    "created_by",
    "confirm_customer_vehicle",
    "register_vehicle_fuel",
    "register_vehicle_charging",
    "register_vehicle_maintenance",
    "vehicle_expense_summary",
    "createMobileServiceRequest",
    "service_request",
    "RLS",
    "requireRole",
  ]) {
    assert.ok(doc.includes(name), "missing canonical contract: " + name);
  }
  assert.match(doc, /litros\s+e\s+kWh/);
  assert.doesNotMatch(doc, /\d+\s*L\s*=\s*\d+\s*kWh/i);
  assert.doesNotMatch(doc, /\d+\s*kWh\s*=\s*\d+\s*L/i);
});

test("merge sequencing doc stays repository-safe, fail-closedand without external actions", async () => {
  const doc = await read(DOC);
  for (const clause of ["Human Gate", "banco remoto", "fail-closed", "nenhum merge", "stop", "rollback", "migration"]) {
    assert.ok(doc.includes(clause, "missing scope clause: " + clause));
  }
  for (const forbidden of ["eas submit", "eas credentials", "production DB", "db push"]) {
    assert.ok(!doc.toLowerCase().includes(forbidden.toLowerCase()), "forbidden action wording: " + forbidden);
  }
});
