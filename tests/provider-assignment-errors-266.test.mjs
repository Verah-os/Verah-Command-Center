import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as errors from "../services/service-providers/assignment-errors.ts";

const requestId = "00000000-0000-4000-8000-000000000001";
const providerId = "00000000-0000-4000-8000-000000000002";
const reference = "00000000-0000-4000-8000-000000000003";
const compiled = ts.transpileModule(readFileSync(new URL("../services/service-providers/actions.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness(error, authorized = true) {
  const calls = [], paths = [], logs = [];
  const modules = {
    "next/navigation": { redirect: (location) => { throw Object.assign(new Error("redirect"), { location }); } },
    "next/cache": { revalidatePath: (path) => paths.push(path) },
    "@/services/auth/profile": { requireRole: async (roles) => {
      assert.deepEqual(roles, ["concierge", "admin"]);
      if (!authorized) throw new Error("forbidden");
    } },
    "@/services/supabase/server": { createSupabaseServerClient: async () => ({
      auth: { getUser: async () => ({ data: { user: { id: "fixture-concierge" } } }) },
      rpc: async (name, args) => { calls.push({ name, args }); return { error }; },
    }) },
    "./assignment-errors": errors,
    "node:crypto": { randomUUID: () => reference },
  };
  const exports = {};
  new Function("require", "exports", "console", compiled)((name) => {
    assert.ok(name in modules, name);
    return modules[name];
  }, exports, { error: (...args) => logs.push(args) });
  return { calls, paths, logs, async run(mode = "assign") {
    const form = new FormData();
    form.set("serviceRequestId", requestId);
    form.set("providerId", providerId);
    form.set("reason", "Synthetic reassignment reason");
    try { await exports[mode === "assign" ? "assignProvider" : "reassignProvider"](form); }
    catch (e) { if (e.location) return new URL(e.location, "https://example.test"); throw e; }
    assert.fail("Expected redirect");
  } };
}

test("#266 eligibility rejection is explained without changing the assignment or authorization", async () => {
  const app = harness({ code: "P0001", message: "Provider is not eligible for this service context." });
  const result = await app.run();
  assert.match(result.searchParams.get("error"), /não está habilitado.*homologação.*categoria.*Portal ativo/);
  assert.equal(result.searchParams.has("providerAssigned"), false);
  assert.deepEqual(app.calls, [{ name: "assign_provider_to_service_request", args: { p_service_request_id: requestId, p_provider_id: providerId } }]);
  assert.deepEqual(app.paths, []);
});

test("#266 owner, inactive provider, stale stage and missing RPC errors are distinguishable", () => {
  for (const [error, expected] of [
    [{ message: "Atendimento não pertence ao Concierge autenticado." }, /outro Concierge/],
    [{ message: "Prestador ativo não encontrado." }, /não está ativo/],
    [{ message: "Este atendimento já possui um prestador indicado." }, /estado atual/],
    [{ code: "42501", message: "private SQL" }, /regra de autorização/],
    [{ code: "PGRST202", message: "private SQL" }, /indisponível nesta versão/],
  ]) assert.match(errors.providerAssignmentErrorMessage(error), expected);
});

test("#266 unknown errors expose only an opaque reference, never database internals", async () => {
  for (const mode of ["assign", "reassign"]) {
    const app = harness({ code: "XX000", message: "private SQL token=secret", details: "customer private data", hint: "internal schema" });
    const result = await app.run(mode);
    assert.match(result.searchParams.get("error"), /causa não foi identificada/);
    assert.match(result.searchParams.get("error"), new RegExp(reference));
    assert.doesNotMatch(result.href + JSON.stringify(app.logs), /private|secret|schema/);
    assert.deepEqual(app.logs, [["service-providers:assignment-failed", { operation: mode, reference, code: "XX000" }]]);
    assert.equal(app.calls.length, 1);
    assert.deepEqual(app.paths, []);
  }
  assert.equal(errors.providerAssignmentErrorCode({ code: "secret\nvalue" }), "UNKNOWN");
});

test("#266 reassignment uses the same safe domain error translation", async () => {
  const app = harness({ code: "P0001", message: "A alteração fica indisponível após o envio do orçamento." });
  assert.match((await app.run("reassign")).searchParams.get("error"), /após o envio do orçamento/);
});

test("#266 successful assignments invalidate canonical provider routes and keep original IDs", async () => {
  for (const mode of ["assign", "reassign"]) {
    const app = harness(null);
    const result = await app.run(mode);
    assert.equal(result.pathname, `/concierge/${requestId}`);
    assert.equal(result.searchParams.get(mode === "assign" ? "providerAssigned" : "providerReassigned"), "1");
    assert.ok(app.paths.includes("/prestador"));
    assert.ok(app.paths.includes(`/prestador/atendimento/${requestId}`));
    assert.equal(app.calls[0].args.p_provider_id, providerId);
    assert.deepEqual(app.logs, []);
  }
});

test("#266 unauthorized roles cannot call assignment RPCs", async () => {
  for (const mode of ["assign", "reassign"]) {
    const app = harness(null, false);
    await assert.rejects(app.run(mode), /forbidden/);
    assert.deepEqual(app.calls, []);
  }
});
