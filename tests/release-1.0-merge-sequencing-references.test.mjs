import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const DOC = "docs/ship-verah/release-1.0-merge-sequencing.md";
const HANDOFF = "docs/handoffs/2026-09-11-issue-249-merge-sequencing-map.md";
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

// Snapshot of the open Release 1.0 Draft PR file sets, taken from the GitHub API on
// 2026-09-11. This is the ground truth the merge map is required to describe; this test
// only asserts repository-local consistency (no network, no credentials).
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
};
const ALL_PATHS = new Set(Object.values(DRAFT_PRS).flat());
const PRS = Object.keys(DRAFT_PRS).map(Number);

test("merge sequencing doc and handoff exist", async () => {
  await read(DOC);
  await read(HANDOFF);
});

test("Draft PR file sets are pairwise collision-free (zero file overlap)", () => {
  for (let i = 0; i < PRS.length; i++) {
    for (let j = i + 1; j < PRS.length; j++) {
      const a = new Set(DRAFT_PRS[PRS[i]]);
      const b = new Set(DRAFT_PRS[PRS[j]]);
      const inter = [...a].filter((p) => b.has(p));
      assert.deepEqual(
        inter,
        [],
        `#${PRS[i]} and #${PRS[j]} share files`,
      );
    }
  }
});

test("every Draft PR file path is spelled out in the merge map", async () => {
  const doc = await read(DOC);
  const missing = [...ALL_PATHS].filter((p) => !doc.includes(p));
  assert.deepEqual(missing, [], "Draft PR paths not listed in the merge map");
});

test("merge sequencing doc references every open Draft PR and the canonical context", async () => {
  const doc = await read(DOC);
  for (const n of PRS.concat([164, 228, 229, 233, 234, 83])) {
    assert.ok(doc.includes(`#${n}`), `doc missing reference to #${n}`);
  }
  assert.ok(doc.includes("Draft"), "doc must state draft scope");
  assert.ok(doc.includes("merge"), "doc must discuss merge sequencing");
});

test("merge sequencing doc states each PR's file countand the recommended order", async () => {
  const doc = await read(DOC);
  for (const n of PRS) {
    assert.ok(doc.includes(`| #${n} |`), `matrix row for #${n} missing`);
    assert.ok(doc.includes(`${DRAFT_PRS[n].length} `), `file count for #${n} missing`);
  }
  assert.ok(doc.includes("#236 antes de #240 e #242"), "order rationale missing");
  assert.match(
    doc,
    /#236\s*→\s*#239\s*→\s*#240\s*→\s*#242\s*→\s*#244\s*→\s*#246\s*→\s*#248/,
    "deterministic merge order missing",
  );
});

test("merge sequencing doc preserves canonical contracts and unit separation", async () => {
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
  for (const clause of ["Human Gate", "banco remoto", "fail-closed", "nenhum merge", "stop", "rollback"]) {
    assert.ok(doc.includes(clause, "missing scope clause: " + clause));
  }
  for (const forbidden of ["eas submit", "eas credentials", "production DB", "db push"]) {
    assert.ok(
      !doc.toLowerCase().includes(forbidden.toLowerCase()),
      "forbidden action wording: " + forbidden,
    );
  }
});