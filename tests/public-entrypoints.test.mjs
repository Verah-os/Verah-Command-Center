import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { requireCanonicalWebEnvironment } from "../lib/verah-environment.ts";

// Execute the actual middleware with in-memory auth. No network or credentials.
const compiled = ts.transpileModule(
  readFileSync(new URL("../middleware.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;

function harness(supabaseUrl = "https://wxnklnbntgpcncajzpsj.supabase.co") {
  let authCalls = 0;
  const next = () => ({ status: 200, cookies: { set() {} } });
  const modules = {
    "next/server": {
      NextResponse: class {
        constructor(body, options) { this.status = options.status; this.body = body; }
        static next = next;
        static redirect = (url) => ({ status: 307, location: url.pathname });
      },
    },
    "@supabase/ssr": {
      createServerClient: () => {
        authCalls++;
        return { auth: { getUser: async () => ({ data: { user: null } }) } };
      },
    },
    "@/lib/env": { env: { supabaseUrl, supabaseAnonKey: "test" } },
    "@/lib/verah-environment": { requireCanonicalWebEnvironment },
    "@/services/auth/access": { isUserRole: () => false, roleHome: {} },
  };
  const exports = {};
  new Function("require", "exports", compiled)((id) => {
    assert.ok(id in modules, `Unexpected dependency: ${id}`);
    return modules[id];
  }, exports);
  return {
    run(path) {
      const url = new URL(path, "https://example.test");
      url.clone = () => new URL(url);
      return exports.middleware({
        nextUrl: url,
        url: url.href,
        cookies: { getAll: () => [], set() {} },
      });
    },
    get authCalls() {
      return authCalls;
    },
  };
}

test("institutional home and demo entry load without auth or database initialization", async () => {
  const app = harness();
  for (const path of [
    "/",
    "/?source=presentation",
    "/demo",
    "/demo?source=home",
    "/demo/cliente/piloto",
  ]) {
    assert.equal((await app.run(path)).status, 200, path);
  }
  assert.equal(app.authCalls, 0);
});

test("wrong hosted backend is blocked before auth and never looks like an empty queue", async () => {
  const app = harness("https://other.supabase.co");
  assert.equal((await app.run("/concierge")).status, 503);
  assert.equal((await app.run("/demo/cliente")).status, 503);
  assert.equal(app.authCalls, 0);
  assert.equal((await app.run("/")).status, 200);
});

test("public entry points do not make command or customer/provider routes public", async () => {
  const app = harness();
  for (const [path, destination] of [
    ["/dashboard", "/login"],
    ["/ai-runtime", "/login"],
    ["/demo/cliente", "/entrar/cliente"],
    ["/demo/prestador", "/entrar/prestador"],
    ["/concierge", "/entrar/concierge"],
    ["/demo/private", "/login"],
    ["/demo/cliente/piloto/private", "/entrar/cliente"],
  ]) {
    const response = await app.run(path);
    assert.equal(response.status, 307, path);
    assert.equal(response.location, destination, path);
  }
  assert.equal(app.authCalls, 7);
});
