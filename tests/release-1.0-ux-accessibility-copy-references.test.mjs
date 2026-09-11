import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const DOC = "docs/ship-verah/release-1.0-ux-accessibility-pack.md";
const HANDOFF = "docs/handoffs/2026-09-11-issue-251-ux-accessibility-pack.md";

function read(path) {
  return readFileSync(new URL("../" + path, import.meta.url), "utf8");
}

const AUDITED_FILES = [
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
  "mobile/src/auth-session.ts",
  "mobile/src/customer-journey.ts",
  "mobile/src/fipe-catalog.ts",
  "mobile/src/maintenance-assist.ts",
  "mobile/src/maintenance.ts",
  "mobile/src/service-request-supabase.ts",
  "mobile/src/service-request.ts",
  "mobile/src/supabase.ts",
  "mobile/src/vehicle-documents.ts",
];
const DRAFT_PRS = {
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
  240: [
    "docs/crm-leads-v0.md",
  ],
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
};
function ownedPaths() {
  const out = [];
  for (const pr of Object.keys(DRAFT_PRS)) {
    for (const p of DRAFT_PRS[pr]) out.push(p);
  }
  return out;
}

const OWNED = new Set(ownedPaths());
const OWNED_MOBILE = [];
for (const path of OWNED) {
  if (path.startsWith("mobile/")) OWNED_MOBILE.push(path);
}
const OWNED_MOBILE_EXPECTED = [
  "mobile/src/FuelHistoryScreen.tsx",
  "mobile/src/customer-journey.ts",
  "mobile/tests/customer-journey.test.mjs",
  "mobile/tests/telemetry-availability.test.mjs",
].sort();

test("QA pack docs exist", () => {
  read(DOC);
  read(HANDOFF);
});

test("QA pack changes are outside every open Draft PR file set", () => {
  const changed = [
    "tests/release-1.0-ux-accessibility-copy-references.test.mjs",
    "mobile/tests/vehicle-documents.test.mjs",
    "mobile/App.tsx",
    "mobile/src/service-request-supabase.ts",
    "mobile/src/fipe-catalog.ts",
    "mobile/src/vehicle-documents.ts",
    "docs/ship-verah/release-1.0-ux-accessibility-pack.md",
    "docs/handoffs/2026-09-11-issue-251-ux-accessibility-pack.md",
  ];
  for (const path of changed) {
    assert.ok(!OWNED.has(path), "collision with a Draft PR file set: " + path);
  }
  assert.deepEqual([...OWNED_MOBILE].sort(), OWNED_MOBILE_EXPECTED);
});

test("audited copy files do not expose raw backend wording in customer strings", () => {
  const forbidden = [
    "Supabase não configurado",
    "backend da VERAH",
    "Chave de idempotência",
  ];
  for (const path of AUDITED_FILES) {
    const source = read(path);
    const bad = [];
    for (const token of forbidden) {
      if (source.includes(token)) bad.push(token);
    }
    assert.deepEqual(bad, [], "raw backend wording in " + path);
  }
});
test("approved customer-safe fallback patterns are present in the audited paths", () => {
  assert.ok(read("mobile/App.tsx").includes("VERAH ainda não está conectada neste ambiente."));
  assert.ok(read("mobile/src/service-request-supabase.ts").includes("A conexão com a VERAH não está configurada neste build."));
  assert.ok(read("mobile/src/fipe-catalog.ts").includes("configurado na VERAH"));
  assert.ok(read("mobile/src/vehicle-documents.ts").includes("Houve um erro ao preparar o arquivo."));
});

test("canonical customer flows still reference canonical contracts and do not synthesize state", () => {
  const doc = read(DOC);
  const journey = read("mobile/src/customer-journey.ts");
  const home = read("mobile/src/CustomerHome.tsx");
  const requests = read("mobile/src/CustomerRequests.tsx");
  const names = [
    "customer_id", "created_by", "confirm_customer_vehicle",
    "replace_customer_vehicle", "register_vehicle_mileage",
    "register_vehicle_fuel", "register_vehicle_charging",
    "register_vehicle_maintenance", "vehicle_expense_summary",
    "createMobileServiceRequest", "service_request", "RLS",
  ];
  for (const name of names) {
    assert.ok(doc.includes(name), "QA doc missing canonical contract: " + name);
  }
  assert.ok(home.includes("stageLabels"));
  assert.ok(requests.includes("stageLabels"));
  assert.ok(!journey.includes("synthetic"));
});
test("fuel/charging liters and kWh remain distinct with no invented conversion", () => {
  const doc = read(DOC);
  const screen = read("mobile/src/FuelHistoryScreen.tsx");
  const journey = read("mobile/src/customer-journey.ts");
  assert.ok(screen.includes("litros nunca viram kWh"));
  assert.ok(journey.includes("unit: \"L\""));
  assert.ok(journey.includes("unit: \"kWh\""));
  assert.ok(doc.includes("litros e kWh **distintos**"));
});

test("maintenance assisted input remains draft-only until explicit confirmation", () => {
  const doc = read(DOC);
  const assist = read("mobile/src/maintenance-assist.ts");
  const screen = read("mobile/src/MaintenanceScreen.tsx");
  const needles = [
    "shouldConfirmAssistedSave",
    "requiresConfirmation",
    "Confirmar e salvar",
    "Nenhum campo foi extraído automaticamente do recibo",
  ];
  for (const needle of needles) {
    assert.ok(screen.includes(needle) || assist.includes(needle));
  }
  assert.match(assist, /km: ""/);
  assert.match(assist, /amount: ""/);
  assert.match(assist, /nextKm: ""/);
  assert.ok(doc.includes("draft-only"));
  assert.ok(doc.includes("confirmação explícita"));
});
test("QA doc stays repository-safe,fail-closed,and within scope", () => {
  const doc = read(DOC);
  const clauses = [
    "Human Gate", "banco remoto", "fail-closed",
    "nenhum banco remoto", "nenhum merge", "FÍSICO", "sem PII",
  ];
  for (const clause of clauses) {
    assert.ok(doc.includes(clause), "missing scope clause: " + clause);
  }
  const forbidden = ["eas submit", "eas credentials", "db push", "production DB"];
  for (const item of forbidden) {
    assert.ok(!doc.toLowerCase().includes(item.toLowerCase()));
  }
});

test("QA doc captures physical-device-only smoke evidence without claiming it done", () => {
  const doc = read(DOC);
  assert.ok(doc.includes("Evidência pós-gate"));
  assert.ok(doc.includes("FÍSICO"));
  assert.ok(doc.includes("reivindicado como concluído"));
  assert.ok(doc.includes("Sem PII"));
  assert.ok(doc.includes("S8"));
});
