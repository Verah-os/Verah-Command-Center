import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const DOC = "docs/ship-verah/release-1.0-alpha-cross-channel-smoke-266.md";
const MIGRATION = "supabase/migrations/20260913090000_canonical_backend_environment_guard.sql";
const SQL_TEST = "supabase/tests/canonical_backend_environment.sql";

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

test("SQL test proves Prestador App/Web on the SAME canonical service_request", () => {
  const sql = read(SQL_TEST);

  // The synthetic active provider fixture is present and bound through
  // user_profiles exactly like the Concierge assignment surface.
  for (const fragment of [
    "26605555-5555-4555-8555-555555555551",
    "'active'",
    "'provider'",
    "'demo'",
  ]) {
    assert.ok(sql.includes(fragment), "SQL test must include the provider fixture/context: " + fragment);
  }

  // The lifecycle runs through the canonical RPCs only (no direct table
  // mutation for the provider transition): accept, assign, quote save +
  // submit, customer approve, and the provider completion wrapper.
  for (const rpc of [
    "public.accept_service_request",
    "public.assign_provider_to_service_request",
    "public.save_service_quote_draft",
    "public.submit_service_quote",
    "public.approve_service_quote",
    "public.provider_mark_service_completed",
  ]) {
    assert.match(sql, new RegExp(`select ${rpc}`), "provider flow must run through canonical RPCs: " + rpc);
  }

  // Provider reads the SAME row through the assignment RLS surface.
  assert.match(
    sql,
    /Assigned provider did not see the canonical service_request/,
    "provider RLS read must be asserted",
  );
  assert.match(sql, /getProviderServiceRequest/, "provider read must mirror the app surface");

  // The customer approves the quote (em_execucao) and the provider executes
  // the real completion action on the same canonical row.
  assert.match(
    sql,
    /Customer approval did not move the canonical row/,
    "approval must move the canonical row to em_execucao",
  );
  assert.match(
    sql,
    /Provider completion did not stamp provider_completed_at/,
    "provider_mark_service_completed must stamp provider_completed_at",
  );

  // Concierge re-finds the updated row; the customer sees the appropriate
  // projection WITHOUT internal provider data.
  assert.match(
    sql,
    /Concierge did not see the provider completion update/,
    "concierge must re-find the provider-updated canonical row",
  );
  assert.match(sql, /Expected a single canonical row/, "flow must prove a single physical row");
  assert.match(
    sql,
    /Customer did not see the provider lifecycle update/,
    "customer must see the provider update on the canonical row",
  );
  assert.match(sql, /getCustomerProviderProfile/, "customer projection must mirror the app surface");
  assert.match(sql, /provider_homologation_profiles/, "customer leak of homologation internals must be asserted");
  assert.match(sql, /provider_performance_events/, "customer leak of performance internals must be asserted");
  assert.match(sql, /is_synthetic/, "synthetic provider flag must stay hidden from the customer");
});

test("smoke runbook covers Cliente/Concierge/Prestador on the same canonical request", () => {
  const doc = read(DOC);
  for (const name of [
    "accept_service_request",
    "assign_provider_to_service_request",
    "save_service_quote_draft",
    "submit_service_quote",
    "approve_service_quote",
    "provider_mark_service_completed",
    "provider_completed_at",
    "getProviderServiceRequest",
    "listProviderServiceRequests",
    "getCustomerProviderProfile",
    "em_execucao",
    "aguardando_aprovacao",
    "prestador_indicado",
  ]) {
    assert.ok(doc.includes(name), "runbook missing canonical flow element: " + name);
  }
  assert.match(doc, /Prestador Web/, "runbook must exercise the Prestador Web channel");
  assert.match(doc, /projeção pública do prestador/, "runbook must keep provider internals out of the customer view");
  assert.match(doc, /MESMO `service_request` canônico/, "runbook must assert the single canonical row");
});