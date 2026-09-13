import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const DOC = "docs/ship-verah/release-1.0-alpha-cross-channel-smoke-266.md";
const MIGRATION = "supabase/migrations/20260913090000_canonical_backend_environment_guard.sql";

test("cross-channel smoke runbook states the single canonical backend invariant", () => {
  const doc = read(DOC).toLowerCase();
  for (const invariant of [
    "backend canônico",
    "mesma tabela",
    "public.service_requests",
    "mesmo projeto supabase",
    "nenhuma sincronização",
    "wxnklnbntgpcncajzpsj",
    "fail-closed",
    "solicitado",
    "origin",
  ]) {
    assert.ok(doc.includes(invariant), `missing invariant: ${invariant}`);
  }
});

test("cross-channel smoke runbook scopes production/remote actions as prohibited", () => {
  const doc = read(DOC).toLowerCase();
  for (const forbidden of ["migration repair", "signing", "produção", "db push"]) {
    assert.ok(
      doc.includes(forbidden) &&
        (doc.includes("não executa") || doc.includes("não executa banco remoto")),
      `forbidden action must be named and scoped as prohibited: ${forbidden}`,
    );
  }
  assert.ok(doc.includes("repository-safe"));
  assert.ok(doc.includes("não executa"));
});

test("canonical origin guard migration is fail-closed and non-secret", () => {
  const sql = read(MIGRATION).toLowerCase();
  assert.match(sql, /create\s+or\s+replace\s+function\s+private\.enforce_canonical_service_request_origin/);
  assert.match(sql, /create\s+trigger\s+service_requests_enforce_canonical_origin/);
  assert.match(sql, /current_user\s*<>\s*'authenticated'/);
  assert.match(sql, /origin\s+is\s+distinct\s+from\s+'customer'/);
  assert.match(sql, /origin\s+is\s+distinct\s+from\s+'concierge'/);
  const probe = read(MIGRATION);
  assert.match(probe, /public\.verah_canonical_environment/);
  assert.doesNotMatch(probe, /service_role.*secret/i, "no secret key is ever touched");
});

test("guard migration is classified as repository-only pending in the sequence test", () => {
  const seq = read("tests/staging-migrations-sequence.test.mjs");
  assert.match(
    seq,
    /20260913090000_canonical_backend_environment_guard\.sql/,
    "pending migration must be listed in PENDING_REPOSITORY_VERSIONS",
  );
});