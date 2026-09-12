import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const MIGRATION = "supabase/migrations/20260912131500_staging_advisor_security_hardening.sql";
const DOC = "docs/ship-verah/release-1.0-staging-advisor-audit.md";

test("advisor hardening explicitly removes browser execution from canonical identity trigger", () => {
  const sql = read(MIGRATION).toLowerCase();
  assert.match(sql, /revoke\s+execute\s+on\s+function\s+public\.bind_service_request_customer_identity\(\)/);
  assert.match(sql, /from\s+public,\s*anon,\s*authenticated/);
});

test("advisor hardening pins all four reported mutable search paths", () => {
  const sql = read(MIGRATION).toLowerCase();
  for (const signature of [
    "public.set_ai_agent_updated_at()",
    "public.dispatcher_engine_log_entry(text)",
    "public.set_dispatcher_job_updated_at()",
    "public.set_system_setting_updated_at()",
  ]) {
    const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(sql, new RegExp(`alter\\s+function\\s+${escaped}\\s+set\\s+search_path\\s*=\\s*pg_catalog`));
  }
});

test("advisor audit keeps no-policy tables deliberately fail-closed", () => {
  const doc = read(DOC).toLowerCase();
  for (const table of [
    "private.work_items",
    "private.execution_runs",
    "private.events",
    "private.locks",
    "private.approvals",
    "private.budgets",
    "public.integration_outbox",
  ]) {
    assert.ok(doc.includes(table), `missing table classification: ${table}`);
  }
  assert.ok(doc.includes("fail-closed"));
  assert.ok(doc.includes("no permissive policy should be added"));
});

test("advisor audit preserves VERAH canonical and rollout boundaries", () => {
  const doc = read(DOC).toLowerCase();
  for (const invariant of [
    "identity",
    "customer/vehicle ownership",
    "service_request",
    "mileage",
    "fuel/energy",
    "expenses",
    "maintenance",
    "documents",
    "rls/auth",
    "litros (l)",
    "kwh",
    "human gate",
    "no remote migration",
  ]) {
    assert.ok(doc.includes(invariant), `missing invariant/boundary: ${invariant}`);
  }
});

test("advisor hardening does not introduce permissive policies or remote actions", () => {
  const sql = read(MIGRATION).toLowerCase();
  assert.doesNotMatch(sql, /create\s+policy/);
  assert.doesNotMatch(sql, /supabase\s+(db\s+push|migration\s+repair|link)/);
  assert.doesNotMatch(sql, /insert\s+into|update\s+public\.|delete\s+from/);
});
