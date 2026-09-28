import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { NextRequest, NextResponse } from "next/server.js";
import { loadTs } from "./helpers/load-ts.mjs";
import * as access from "../services/auth/access.ts";
import { requireCanonicalWebEnvironment } from "../lib/verah-environment.ts";

function middlewareFor(role, options = {}) {
  return loadTs("middleware.ts", {
    "next/server": { NextResponse },
    "@supabase/ssr": { createServerClient: (_url, _key, config) => ({
      auth: { getUser: async () => {
        config.cookies.setAll([{ name: "fixture-session", value: "renewed", options: { httpOnly: true } }]);
        return { data: { user: role === null ? null : { id: "fixture-user" } }, error: options.expired ? new Error("expired") : null };
      } },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
        data: options.missing ? null : { role }, error: options.readError ? new Error("read failed") : null,
      }) }) }) }),
    }) },
    "@/lib/env": { env: { supabaseUrl: "http://127.0.0.1:54321", supabaseAnonKey: "fixture" } },
    "@/lib/verah-environment": { requireCanonicalWebEnvironment },
    "@/services/auth/access": access,
  }).middleware;
}
function request(method = "POST", action = true) {
  return new NextRequest("https://example.test/prestadores?provider=fixture&next=https://evil.test", {
    method, headers: action ? { "next-action": "fixture-action" } : {},
  });
}

// Exercise the response decoder shipped by the installed, lockfile-pinned Next.
// Only network and unrelated RSC serialization are replaced. This verifies that
// the middleware protocol is understood by the real framework, not a copied parser.
const require = createRequire(import.meta.url);
const reducer = readFileSync(require.resolve("next/dist/client/components/router-reducer/reducers/server-action-reducer.js"), "utf8");
const decoder = reducer.slice(reducer.indexOf("async function fetchServerAction("), reducer.indexOf("const NO_REVALIDATED_PARTS"));
function decode(response) {
  const dependencies = {
    fetch: async () => response,
    window: { location: { href: "https://example.test/prestadores" } },
    _client: { createTemporaryReferenceSet: () => new Set(), encodeReply: async () => "synthetic-form" },
    _serverreferenceinfo: { extractInfoFromServerReferenceId: () => ({ type: "server-action" }) },
    _approuterheaders: require("next/dist/client/components/app-router-headers.js"),
    _flightdatahelpers: { prepareFlightRouterStateForRequest: () => "[]" },
    _redirecterror: { RedirectType: { push: "push", replace: "replace" } },
    _assignlocation: { assignLocation: (path, base) => new URL(path, base) },
    NO_REVALIDATED_PARTS: { paths: [], tag: false, cookie: false },
  };
  const fetchAction = new Function(...Object.keys(dependencies), `${decoder}; return fetchServerAction;`)(...Object.values(dependencies));
  return fetchAction({ canonicalUrl: "/prestadores", tree: [] }, null, { actionId: "fixture-action", actionArgs: [] });
}

test("reproduces reported crash: HTML after middleware 307 is rejected by Next action decoder", async () => {
  // fetch follows the old 307 and returns /login HTML, exactly the observed POST chain.
  await assert.rejects(decode(new Response("<html>Login</html>", { headers: { "content-type": "text/html" } })), /unexpected response/);
});

for (const [role, options, error] of [
  ["provider", {}, "access_denied"], ["customer", {}, "access_denied"], ["concierge", {}, "access_denied"],
  [null, {}, "session_required"], ["admin", { expired: true }, "session_required"],
  ["admin", { missing: true }, "profile_missing"], ["invalid", {}, "profile_invalid"],
  ["admin", { readError: true }, "profile_error"],
]) {
  test(`denied action ${role}/${error}: real Next decoder navigates to login without replaying POST`, async () => {
    const result = await middlewareFor(role, options)(request());
    assert.equal(result.status, 303);
    assert.equal(result.headers.get("location"), null, "fetch must not replay a POST to the login page");
    assert.equal(result.headers.get("x-middleware-next"), null, "denied requests must not reach an action");
    assert.equal(result.headers.get("Cache-Control"), "private, no-store");
    assert.equal(result.cookies.get("fixture-session").value, "renewed");
    const decoded = await decode(result);
    assert.equal(decoded.redirectLocation.href, `https://example.test/login?error=${error}`);
    assert.equal(decoded.redirectType, "replace");
    assert.equal(decoded.actionResult, undefined);
  });
}

test("authorized Admin action still reaches the guarded handler", async () => {
  const result = await middlewareFor("admin")(request());
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("x-middleware-next"), "1");
  assert.equal(result.headers.get("x-action-redirect"), null);
});

test("ordinary POST changes to GET at login; normal GET retains its redirect", async () => {
  const middleware = middlewareFor("provider");
  const post = await middleware(request("POST", false));
  assert.equal(post.status, 303);
  assert.equal(post.headers.get("location"), "https://example.test/login?error=access_denied");
  assert.equal(post.headers.get("x-action-redirect"), null);
  const get = await middleware(request("GET", false));
  assert.equal(get.status, 307);
});
