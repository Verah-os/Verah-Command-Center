import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("../supabase/migrations/20260827013000_identity_onboarding_foundation.sql", import.meta.url);

test("identity remains separate from auth accounts and supports multiple relations", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create table public\.verah_identities/);
  assert.match(sql, /create table public\.identity_relations/);
  assert.match(sql, /relation_type in \('customer', 'provider', 'concierge', 'admin'\)/);
  assert.doesNotMatch(sql, /email text.*primary key|phone text.*primary key/i);
});

test("public onboarding cannot self-assign privileged roles or approve providers", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /Privileged identities cannot self-enroll/g);
  assert.match(sql, /'inactive', false/);
  assert.match(sql, /'candidate'/);
  assert.match(sql, /current_verah_role\(\)\) <> 'admin'/);
  assert.doesNotMatch(sql, /start_(customer_onboarding|provider_application)[\s\S]*'approved'/);
});

test("customer and provider routes expose signup while internal roles remain login-only", async () => {
  const [customer, provider, concierge] = await Promise.all([
    readFile(new URL("../app/entrar/cliente/cadastro/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/entrar/prestador/cadastro/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/entrar/concierge/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(customer, /signUpCustomerWithEmail/);
  assert.match(provider, /signUpProviderApplicationWithEmail/);
  assert.doesNotMatch(concierge, /signUp|cadastro/i);
});
