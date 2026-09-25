import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";
import { createJourneyPoller, isJourneyPath } from "../lib/journey-poller.ts";

function client() {
  const state = { active: true, editing: false, refreshes: 0, sessions: 0, reads: 0, status: "", result: { session: "one", revision: "1" }, error: false };
  const poller = createJourneyPoller({
    read: async () => { state.reads++; if (state.error) throw new Error("offline"); return { ...state.result }; },
    active: () => state.active, editing: () => state.editing,
    refresh: () => state.refreshes++, sessionChanged: () => state.sessions++, status: value => { state.status = value; },
  });
  return { state, poller };
}

test("#275 changes refresh once, unchanged revisions do not repeatedly render", async () => {
  const { state, poller } = client();
  await poller.tick(); await poller.tick();
  assert.equal(state.refreshes, 1);
  state.result.revision = "2";
  await poller.tick(); assert.equal(state.refreshes, 2);
});

test("#275 editing defers updates until safe, including retries after errors", async () => {
  const { state, poller } = client();
  await poller.tick(); state.editing = true; state.result.revision = "2";
  await poller.tick(); assert.equal(state.status, "pending"); assert.equal(state.refreshes, 1);
  state.error = true; await poller.tick(); assert.equal(state.status, "unavailable");
  state.error = false; await poller.tick(); assert.equal(state.refreshes, 1);
  state.editing = false; await poller.tick(); assert.equal(state.refreshes, 2);
});

test("#275 hidden/offline tabs pause and resume without losing changes", async () => {
  const { state, poller } = client(); state.active = false;
  await poller.tick(); assert.equal(state.reads, 0);
  state.active = true; await poller.tick(); assert.equal(state.refreshes, 1);
});

test("#275 session changes invalidate the old page even while editing", async () => {
  const { state, poller } = client(); await poller.tick();
  state.editing = true; state.result.session = "another";
  await poller.tick(); await poller.tick();
  assert.equal(state.sessions, 1); assert.equal(state.reads, 2);
});

test("#275 overlapping requests are suppressed and stopped controllers ignore in-flight work", async () => {
  let finish; let reads = 0; let renders = 0;
  const poller = createJourneyPoller({ read: () => { reads++; return new Promise(resolve => { finish = resolve; }); }, active: () => true, editing: () => false, refresh: () => renders++, sessionChanged: () => {}, status: () => {} });
  const pending = poller.tick(); await poller.tick(); assert.equal(reads, 1);
  poller.stop(); finish({ session: "one", revision: "one" }); await pending;
  assert.equal(renders, 0);
});

test("#275 only journey lists/details activate polling, not demos, login or new forms", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  for (const path of ["/prestador", "/demo/prestador", "/concierge", "/demo/cliente", `/prestador/atendimento/${id}`, `/demo/cliente/atendimento/${id}`, `/concierge/${id}`]) assert.equal(isJourneyPath(path), true, path);
  for (const path of ["/", "/login", "/demo/cliente/piloto", "/concierge/novo-atendimento", "/demo/cliente/novo-atendimento", "/dashboard", "/prestador-evil"]) assert.equal(isJourneyPath(path), false, path);
});

const compiled = ts.transpileModule(readFileSync(new URL("../services/journey/live-actions.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function server(profile, database, fail = false) {
  const modules = {
    "node:crypto": { createHash },
    "@/services/auth/profile": { getCurrentProfileState: async () => profile ? { status: "authenticated", profile } : { status: "unauthenticated" } },
    "@/services/supabase/server": { createSupabaseServerClient: async () => ({ from: table => ({ select: columns => {
      assert.equal(columns, "id,updated_at");
      return { order: column => { assert.equal(column, "id"); return { range: async (start, end) => {
        if (fail) return { error: { message: "private failure" } };
        return { data: database[table].filter(row => row.audience.includes(profile.role)).slice(start, end + 1).map(({ id, updated_at }) => ({ id, updated_at })) };
      } }; } };
    } }) }) },
  };
  const exports = {};
  new Function("require", "exports", compiled)(name => { assert.ok(name in modules); return modules[name]; }, exports);
  return exports.getJourneyRevision;
}

test("#275 distinct sessions observe the same canonical request changes through their authorized projection", async () => {
  const db = { service_requests: [{ id: "same-request", updated_at: "1", audience: ["customer", "concierge", "provider"] }], service_quotes: [{ id: "draft", updated_at: "1", audience: ["provider"] }] };
  const readers = ["customer", "concierge", "provider"].map(role => server({ userId: role, role }, db));
  const before = await Promise.all(readers.map(read => read()));
  assert.equal(new Set(before.map(value => value.session)).size, 3);
  db.service_requests[0].updated_at = "2";
  const after = await Promise.all(readers.map(read => read()));
  after.forEach((value, i) => assert.notEqual(value.revision, before[i].revision));
  db.service_quotes[0].updated_at = "2";
  const draft = await Promise.all(readers.map(read => read()));
  assert.equal(draft[0].revision, after[0].revision);
  assert.equal(draft[1].revision, after[1].revision);
  assert.notEqual(draft[2].revision, after[2].revision);
  assert.doesNotMatch(JSON.stringify(draft), /same-request|draft|provider|customer/);
});

test("#275 query failures reject instead of producing an empty/successful revision", async () => {
  await assert.rejects(server({ role: "customer" }, {}, true)(), /unavailable/);
  assert.deepEqual(await server(null, {})(), { session: null, revision: null });
});
