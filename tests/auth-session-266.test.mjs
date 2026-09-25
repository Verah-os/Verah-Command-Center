import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as access from "../services/auth/access.ts";
import { requireCanonicalWebEnvironment } from "../lib/verah-environment.ts";

function load(file, modules) {
  const compiled = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("require", "exports", compiled)((id) => {
    assert.ok(id in modules, `Unexpected dependency: ${id}`);
    return modules[id];
  }, exports);
  return exports;
}
const redirect = (location) => { throw Object.assign(new Error("redirect"), { location }); };
async function destination(action) {
  try { await action(); } catch (error) {
    if (error.location) return error.location;
    throw error;
  }
  assert.fail("Expected redirect");
}
function harness(role = "concierge", options = {}) {
  const state = { role, user: role ? { id: `${role}-user` } : null, calls: [], invalidated: 0 };
  const client = {
    auth: {
      getUser: async () => {
        options.cookies?.setAll([{ name: "session", value: "refreshed", options: { httpOnly: true } }]);
        return { data: { user: state.user }, error: options.userError };
      },
      signOut: async (args) => {
        state.calls.push(["signOut", args]);
        if (options.signOutError) return { error: new Error("offline") };
        state.user = null;
        state.role = null;
        return { error: null };
      },
      signInWithPassword: async ({ email }) => {
        state.calls.push(["signIn", email]);
        if (options.invalidCredentials) return { data: {}, error: new Error("invalid") };
        state.role = options.loginRole ?? "provider";
        state.user = { id: "provider-user" };
        return { data: { user: state.user }, error: null };
      },
    },
    from: (table) => {
      assert.equal(table, "user_profiles");
      return { select: () => ({ eq: (field, id) => {
        assert.equal(field, "user_id");
        assert.equal(id, state.user.id);
        return { maybeSingle: async () => ({
          data: options.missingProfile ? null : {
            role: state.role, user_id: id, display_name: "Fixture", provider_id: "fixture-provider",
          }, error: options.profileError,
        }) };
      } }) };
    },
    rpc: async (name) => {
      state.calls.push(["rpc", name]);
      assert.equal(name, "get_own_provider_homologation");
      return { data: { homologation_status: "approved" } };
    },
  };
  const modules = {
    "@/services/auth/access": access,
    "@/services/supabase/server": { createSupabaseServerClient: async () => client },
    "next/navigation": { redirect },
    "next/cache": { revalidatePath: () => { state.invalidated++; } },
  };
  const actions = load("../services/auth/actions.ts", modules);
  const profile = load("../services/auth/profile.ts", modules);
  function response(status = 200, location) {
    const jar = new Map();
    return { status, location, headers: new Map(), cookies: {
      set: (name, value, attributes) => {
        const cookie = typeof name === "object" ? name : { name, value, ...attributes };
        jar.set(cookie.name, cookie);
      },
      getAll: () => [...jar.values()],
    } };
  }
  const { middleware } = load("../middleware.ts", {
    ...modules,
    "next/server": { NextResponse: { next: () => response(), redirect: (url) => response(307, url.pathname + url.search) } },
    "@supabase/ssr": { createServerClient: (_url, _key, config) => { options.cookies = config.cookies; return client; } },
    "@/lib/env": { env: { supabaseUrl: "https://wxnklnbntgpcncajzpsj.supabase.co", supabaseAnonKey: "fixture" } },
    "@/lib/verah-environment": { requireCanonicalWebEnvironment },
  });
  return { state, actions, profile, async run(path, method = "GET") {
    const url = new URL(path, "https://example.test");
    url.clone = () => new URL(url);
    return middleware({ nextUrl: url, url: url.href, method, cookies: { getAll: () => [], set() {} } });
  } };
}
function credentials() {
  const form = new FormData();
  form.set("email", "provider@example.test");
  form.set("password", "synthetic-password");
  form.set("audience", "provider");
  return form;
}

test("#266 provider canonical home and nested/legacy routes never redirect to themselves", async () => {
  const app = harness("provider");
  for (const path of ["/prestador", "/prestador?error=access_denied", "/prestador/atendimento/fixture", "/demo/prestador", "/onboarding/prestador"]) {
    assert.equal((await app.run(path)).status, 200, path);
  }
});

test("#266 all mismatched roles terminate at login in one hop; login GET/POST stays reachable", async () => {
  for (const role of access.userRoles) {
    for (const [path, allowed] of [["/prestador", ["provider", "admin"]], ["/concierge", ["concierge", "admin"]], ["/demo/cliente", ["customer"]], ["/dashboard", ["admin"]], ["/prestador-malicious", ["admin"]]]) {
      const app = harness(role);
      const result = await app.run(path);
      if (allowed.includes(role)) { assert.equal(result.status, 200); continue; }
      assert.equal(result.status, 307);
      assert.match(result.location, /error=access_denied/);
      assert.notEqual(result.location.split("?")[0], path);
      assert.equal((await app.run(result.location)).status, 200);
      assert.equal((await app.run(result.location, "POST")).status, 200);
    }
  }
});

test("#266 requireRole denial terminates even when roleHome is itself guarded", async () => {
  for (const role of access.userRoles) {
    const app = harness(role);
    const target = await destination(() => app.profile.requireRole([]));
    assert.equal(target, "/login?error=access_denied");
    assert.equal((await app.run(target)).status, 200);
  }
});

test("#266 Concierge -> Provider switches local session and preserves canonical profile", async () => {
  const app = harness("concierge");
  assert.equal((await app.run("/prestador")).location, "/entrar/prestador?error=access_denied");
  assert.equal((await app.run("/entrar/prestador", "POST")).status, 200);
  assert.equal(await destination(() => app.actions.signInWithEmail(credentials())), "/prestador");
  assert.deepEqual(app.state.calls.slice(0, 2), [["signOut", { scope: "local" }], ["signIn", "provider@example.test"]]);
  assert.equal(app.state.invalidated, 1);
  assert.equal((await app.run("/prestador")).status, 200);
  assert.equal((await app.profile.requireRole(["provider", "admin"])).providerId, "fixture-provider");
  assert.equal((await app.run("/concierge")).location, "/entrar/concierge?error=access_denied");
});

test("#266 failed new credentials cannot retain the Concierge session", async () => {
  const app = harness("concierge", { invalidCredentials: true });
  assert.equal(await destination(() => app.actions.signInWithEmail(credentials())), "/entrar/prestador?error=invalid_credentials");
  assert.equal(app.state.user, null);
  assert.equal((await app.run("/concierge")).location, "/entrar/concierge?error=session_required");
});

test("#266 signout errors stop account switching and show a stable recovery page", async () => {
  const app = harness("concierge", { signOutError: true });
  const target = await destination(() => app.actions.signInWithEmail(credentials()));
  assert.equal(target, "/entrar/prestador?error=signout_failed");
  assert.equal(app.state.calls.length, 1);
  assert.equal((await app.run(target)).status, 200);
  assert.equal(await destination(() => app.actions.signOut()), "/login?error=signout_failed");
});

test("#266 explicit signout is local and invalidates cached protected layouts", async () => {
  const app = harness();
  assert.equal(await destination(() => app.actions.signOut()), "/login");
  assert.equal(app.state.user, null);
  assert.deepEqual(app.state.calls, [["signOut", { scope: "local" }]]);
  assert.equal(app.state.invalidated, 1);
});

test("#266 missing/invalid/error profiles and expired sessions fail closed without loops", async () => {
  for (const [role, options, error] of [["provider", { missingProfile: true }, "profile_missing"], ["owner", {}, "profile_invalid"], ["provider", { profileError: new Error("query") }, "profile_error"], ["provider", { userError: new Error("expired") }, "session_required"], [null, {}, "session_required"]]) {
    const app = harness(role, options);
    const result = await app.run("/prestador");
    assert.equal(result.location, `/entrar/prestador?error=${error}`);
    assert.equal((await app.run(result.location)).status, 200);
  }
});

test("#266 denial redirects preserve renewed auth cookies and disable caching", async () => {
  const app = harness("concierge");
  const result = await app.run("/prestador?next=https://evil.test");
  assert.equal(result.location, "/entrar/prestador?error=access_denied");
  assert.deepEqual(result.cookies.getAll(), [{ name: "session", value: "refreshed", httpOnly: true }]);
  assert.equal(result.headers.get("Cache-Control"), "private, no-store");
});
