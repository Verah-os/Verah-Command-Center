import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("every administrative Server Action requires the admin role", () => {
  const expectations = {
    "services/work-orders/actions.ts": 1,
    "services/settings/actions.ts": 1,
    "services/dispatcher/actions.ts": 5,
  };

  for (const [path, expectedGuards] of Object.entries(expectations)) {
    const source = read(path);
    assert.equal(
      source.match(/requireRole\(\["admin"\]\)/g)?.length ?? 0,
      expectedGuards,
      `${path} must guard every administrative action`,
    );

    for (const action of source.matchAll(
      /export async function \w+\([^)]*\) \{([\s\S]*?)(?=\nexport async function|\nexport function|$)/g,
    )) {
      const body = action[1];
      if (!body.includes('requireRole(["admin"])')) continue;
      const guardPosition = body.indexOf('requireRole(["admin"])');
      const inputPosition = body.indexOf("formData.get(");
      assert.ok(
        inputPosition === -1 || guardPosition < inputPosition,
        `${path} must authorize before reading browser input`,
      );
    }
  }
});

test("customer and concierge actions retain their role guards", () => {
  assert.match(
    read("services/customer-vehicles/actions.ts"),
    /requireRole\(\["customer"\]\)/,
  );
  assert.match(
    read("services/concierge/actions.ts"),
    /requireRole\(\["concierge", "admin"\]\)/,
  );
});

test("authentication UI distinguishes pending and failed authorization states", () => {
  const form = read("components/auth/login-form.tsx");
  const submit = read("components/auth/login-submit-button.tsx");

  for (const state of [
    "invalid_credentials",
    "profile_missing",
    "profile_invalid",
    "profile_error",
    "session_required",
  ]) {
    assert.match(form, new RegExp(state));
  }

  assert.match(submit, /useFormStatus/);
  assert.match(submit, /disabled=\{pending\}/);
  assert.match(submit, /Validando acesso/);
});

test("hardening migration scopes tables and privileged functions to admin", () => {
  const migration = read(
    "supabase/migrations/20260727225432_secure_admin_authorization.sql",
  );

  for (const table of [
    "work_orders",
    "dispatcher_jobs",
    "ai_agents",
    "system_settings",
  ]) {
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table} enable row level security`, "i"),
    );
    assert.match(
      migration,
      new RegExp(
        `revoke all on table public\\.${table} from anon, authenticated`,
        "i",
      ),
    );
  }

  const privilegedFunctions = [
    "dispatcher_engine_start_next_job",
    "dispatcher_engine_finish_job",
    "dispatcher_engine_retry_failed_job",
    "dispatcher_engine_mark_job_completed",
    "dispatcher_engine_mark_job_failed",
    "dispatcher_complete_ai_runtime_job",
  ];

  for (const functionName of privilegedFunctions) {
    assert.match(
      migration,
      new RegExp(`function public\\.${functionName}`, "i"),
    );
  }

  assert.equal(
    migration.match(/current_verah_role\(\)\) is distinct from 'admin'/g)
      ?.length ?? 0,
    privilegedFunctions.length,
  );
  assert.equal(
    migration.match(/auth\.jwt\(\) ->> 'role'/g)?.length ?? 0,
    privilegedFunctions.length,
  );
  assert.equal(
    migration.match(
      /revoke all on function public\.dispatcher_[\s\S]*?from public, anon, authenticated;/g,
    )?.length ?? 0,
    privilegedFunctions.length,
  );
  assert.doesNotMatch(migration, /user_metadata|raw_user_meta_data/i);
});
