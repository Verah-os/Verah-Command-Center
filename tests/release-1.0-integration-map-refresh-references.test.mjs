import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const DOC = "docs/ship-verah/release-1.0-integration-map-refresh-254-255-256.md";
const HANDOFF = "docs/handoffs/2026-09-11-issue-257-integration-map-refresh.md";
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

// Snapshot taken from the GitHub API on 2026-09-12 (refresh of issue #257 / PR #258 after the
// Release 1.0 pipeline fully landed). ALL pipeline PRs listed below were merged into `main`
// (head = 79f5be0, merge of #255). Their file sets are recorded as landed ownership; the only
// remaining open Release 1.0 pipeline PR is this refresh itself (#258), which uses brand-new
// isolated paths that belong to nobody else.
const LANDED_PRS = {
  256: [
    "docs/ship-verah/release-1.0-staging-migrations-runbook.md",
    "tests/staging-migrations-sequence.test.mjs",
  ],
  236: [
    "app/(command)/clientes/[id]/loading.tsx",
    "app/(command)/clientes/[id]/not-found.tsx",
    "app/(command)/clientes/[id]/page.tsx",
    "app/(command)/clientes/error.tsx",
    "app/(command)/clientes/loading.tsx",
    "app/(command)/clientes/page.tsx",
    "app/(command)/dashboard/page.tsx",
    "components/app-shell.tsx",
    "components/customer-crm/dashboard-metrics.tsx",
    "components/customer-crm/panels.tsx",
    "docs/customer-crm-v1.md",
    "modules/registry.ts",
    "services/customer-crm/read-model.ts",
    "services/customer-crm/service.ts",
    "tests/customer-crm.test.mjs",
    "vercel.json",
  ],
  239: [
    "docs/alpha-5-operations-runbook.md",
    "docs/handoffs/2026-09-10-issue-237-alpha5-runbook-readiness.md",
  ],
  240: ["docs/crm-leads-v0.md"],
  242: [
    "docs/customer-360-telemetry-v1.md",
    "scripts/ci/test-database.sh",
    "supabase/tests/customer_360_telemetry_read.sql",
  ],
  244: [
    "mobile/src/FuelHistoryScreen.tsx",
    "mobile/src/customer-journey.ts",
    "mobile/tests/customer-journey.test.mjs",
    "mobile/tests/telemetry-availability.test.mjs",
  ],
  246: [
    "docs/ship-verah/release-1.0-android-physical-smoke.md",
    "tests/android-smoke-pack-references.test.mjs",
  ],
  248: [
    "docs/handoffs/2026-09-11-issue-247-ios-readiness.md",
    "docs/ship-verah/release-1.0-ios-readiness.md",
    "tests/ios-readiness-references.test.mjs",
  ],
  250: [
    "docs/handoffs/2026-09-11-issue-249-merge-sequencing-map.md",
    "docs/ship-verah/release-1.0-merge-sequencing.md",
    "tests/release-1.0-merge-sequencing-references.test.mjs",
  ],
  254: [
    "docs/handoffs/2026-09-11-issue-251-ux-accessibility-pack.md",
    "docs/ship-verah/release-1.0-ux-accessibility-pack.md",
    "mobile/App.tsx",
    "mobile/src/fipe-catalog.ts",
    "mobile/src/service-request-supabase.ts",
    "mobile/src/vehicle-documents.ts",
    "mobile/tests/vehicle-documents.test.mjs",
    "tests/release-1.0-ux-accessibility-copy-references.test.mjs",
  ],
  255: [
    "app/(command)/concierge/[id]/page.tsx",
    "app/(command)/concierge/novo-atendimento/page.tsx",
    "app/(command)/concierge/page.tsx",
    "app/(command)/settings/commercial/page.tsx",
    "app/demo/cliente/atendimento/[id]/page.tsx",
    "app/demo/cliente/garantias/page.tsx",
    "app/demo/cliente/historico/page.tsx",
    "app/demo/cliente/novo-atendimento/page.tsx",
    "app/demo/cliente/page.tsx",
    "app/demo/cliente/veiculo/[id]/page.tsx",
    "app/demo/cliente/veiculos/page.tsx",
    "app/demo/concierge/loading.tsx",
    "app/demo/concierge/page.tsx",
    "app/demo/page.tsx",
    "app/demo/prestador/atendimento/[id]/page.tsx",
    "app/demo/prestador/page.tsx",
    "app/demo/whatsapp/page.tsx",
    "app/demo/whatsapp/submit-button.tsx",
    "app/entrar/cliente/cadastro/page.tsx",
    "app/entrar/cliente/page.tsx",
    "app/entrar/concierge/page.tsx",
    "app/entrar/prestador/cadastro/page.tsx",
    "app/entrar/prestador/page.tsx",
    "app/globals.css",
    "app/onboarding/cliente/page.tsx",
    "app/onboarding/prestador/page.tsx",
    "components/concierge/demo-decision-panel.tsx",
    "components/concierge/provider-assignment-form.tsx",
    "components/concierge/provider-trust-panel.tsx",
    "components/customer/customer-shell.tsx",
    "components/customer/vehicle-edit-form.tsx",
    "components/demo/customer-answers-form.tsx",
    "components/demo/quote-form.tsx",
    "components/demo/service-request-form.tsx",
    "docs/design-system-v1.md",
    "mobile/App.tsx",
    "mobile/src/AuthGate.tsx",
    "mobile/src/AuthScreen.tsx",
    "mobile/src/CustomerHome.tsx",
    "mobile/src/CustomerJourney.tsx",
    "mobile/src/CustomerRequests.tsx",
    "mobile/src/FuelHistoryScreen.tsx",
    "mobile/src/MaintenanceScreen.tsx",
    "mobile/src/MileageHistoryScreen.tsx",
    "mobile/src/VehicleDocumentsScreen.tsx",
    "mobile/src/VehicleOnboardingStep.tsx",
    "next-env.d.ts",
    "tailwind.config.ts",
  ],
};
const LANDED_KEYS = Object.keys(LANDED_PRS).map(Number);
const ALL_LANDED = new Set(Object.values(LANDED_PRS).flat());

// Open Release 1.0 pipeline PRs after the full integration: NONE left. The only open
// pipeline PR is this refresh itself (#258). The two known cross-set file intersections are
// inherited from the historical ownership attributions and were verified on the merge diff of
// #255 (79f5be0^..79f5be0) as pure color-token retint (no copy/a11y/unit changes).
const OPEN_PRS = {};
const ALL_OPEN = new Set(Object.values(OPEN_PRS).flat());
const OPEN_KEYS = Object.keys(OPEN_PRS).map(Number);

// New paths introduced by this refresh (issue #257 / PR #258) — must be owned by nobody else.
const REFRESH_PATHS = [
  "docs/ship-verah/release-1.0-integration-map-refresh-254-255-256.md",
  "docs/handoffs/2026-09-11-issue-257-integration-map-refresh.md",
  "tests/release-1.0-integration-map-refresh-references.test.mjs",
];

// Merge SHAs on `main` for every landed pipeline PR (2026-09-12; main head = 79f5be0, merge of #255).
const MERGE_SHAS = {
  256: "3afe690",
  236: "c459b27",
  239: "e95c53f",
  240: "be65bcb",
  242: "981ef0b",
  244: "8c04e4c",
  246: "bd90691",
  248: "c71ec30",
  250: "da1d5d0",
  254: "586131b",
  255: "79f5be0",
};

test("refresh doc and handoff exist", async () => {
  await read(DOC);
  await read(HANDOFF);
});

test("refresh files do not collide with any landed pipeline PR file set (incl #250/#254/#255)", () => {
  for (const p of REFRESH_PATHS) {
    assert.ok(!ALL_LANDED.has(p), "collision with a landed pipeline PR file set: " + p);
  }
});

test("every landed pipeline PR file set is listed in the refresh doc with its file count", async () => {
  const doc = await read(DOC);
  const missing = [...ALL_LANDED].filter((p) => !doc.includes(p));
  assert.deepEqual(missing, [], "landed pipeline paths not listed in the refresh map");
  for (const n of LANDED_KEYS) {
    assert.ok(doc.includes(`#${n}`), `ref to #${n} missing`);
    assert.ok(doc.includes(`| #${n} |`) || doc.includes(`${n} `), `landing row for #${n} missing`);
    assert.ok(doc.includes(`${LANDED_PRS[n].length} `), `file count for #${n} missing`);
  }
});

test("refresh doc references the landed merge SHAs and the final main head", async () => {
  const doc = await read(DOC);
  for (const n of LANDED_KEYS) {
    assert.ok(doc.includes(MERGE_SHAS[n]), `missing merged commit for #${n}`);
  }
  assert.ok(doc.includes("79f5be0"), "missing current main head (merge of #255)");
  assert.ok(doc.includes("Draft"), "doc must state draft scope");
  assert.ok(doc.includes("merge"), "doc must discuss merge sequencing");
});

test("refresh doc confirms the pipeline is fully integrated with only #258 left open", async () => {
  const doc = await read(DOC);
  for (const pr of [236, 239, 240, 242, 244, 246, 248, 250, 254, 255, 256]) {
    assert.ok(doc.includes(`#${pr}`), `doc missing reference to pipelined PR #${pr}`);
  }
  // The live open pipeline set is only this refresh.
  assert.ok(doc.includes("`#258`"), "missing this refresh entry (#258)");
  // Landed merge SHAs must appear as integrated context.
  for (const sha of ["3afe690", "c459b27", "e95c53f", "be65bcb", "981ef0b", "8c04e4c", "bd90691", "c71ec30", "da1d5d0", "586131b"]) {
    assert.ok(doc.includes(sha), "missing integrated merge SHA: " + sha);
  }
});

test("refresh doc documents the DS ownership and the semantic follow-up mapping", async () => {
  const doc = await read(DOC);
  for (const f of ["mobile/src/AuthScreen.tsx", "mobile/src/CustomerHome.tsx", "mobile/src/CustomerRequests.tsx", "mobile/src/VehicleOnboardingStep.tsx", "mobile/src/MaintenanceScreen.tsx", "mobile/src/MileageHistoryScreen.tsx", "mobile/src/VehicleDocumentsScreen.tsx", "mobile/src/CustomerJourney.tsx", "mobile/src/AuthGate.tsx"]) {
    assert.ok(doc.includes(f), "missing DS-owned path: " + f);
  }
  assert.ok(doc.includes("mobile/src/FuelHistoryScreen.tsx"), "missing #244 ownership mention");
  assert.ok(doc.includes("mobile/App.tsx"), "missing retint mention of mobile/App.tsx");
  assert.ok(doc.includes("docs/design-system-v1.md"), "missing design-system doc ownership");
});

test("refresh doc preserves canonical contracts and unit separation", async () => {
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

test("refresh doc stays repository-safe, fail-closedand without external actions", async () => {
  const doc = await read(DOC);
  for (const clause of ["Human Gate", "banco remoto", "fail-closed", "nenhum merge", "stop", "rollback", "migration"]) {
    assert.ok(doc.includes(clause, "missing scope clause: " + clause));
  }
  for (const forbidden of ["eas submit", "eas credentials", "production DB", "db push", "supabase db push"]) {
    assert.ok(
      !doc.toLowerCase().includes(forbidden.toLowerCase()),
      "forbidden action wording: " + forbidden,
    );
  }
});