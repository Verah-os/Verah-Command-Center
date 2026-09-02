import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import { resolveSupabaseConfig } from "../mobile/src/config.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const readJson = async (path) => JSON.parse(await read(path));

test("mobile app identity is explicitly non-production", async () => {
  const appJson = await readJson("../mobile/app.json");
  const expo = appJson.expo;
  assert.match(expo.name, /Dev/);
  assert.equal(expo.slug, "verah-dev");
  assert.equal(expo.scheme, "verah-dev");
  assert.equal(expo.ios.bundleIdentifier, "com.verah.app.dev");
  assert.equal(expo.android.package, "com.verah.app.dev");
  assert.ok(expo.ios.bundleIdentifier.endsWith(".dev"));
  assert.ok(expo.android.package.endsWith(".dev"));
  assert.equal(expo.extra.environment, "development");
});

test("mobile package reuses the Supabase stack without server tooling", async () => {
  const pkg = await readJson("../mobile/package.json");
  assert.equal(pkg.private, true);
  for (const dep of ["expo", "react", "react-native", "@supabase/supabase-js", "@react-native-async-storage/async-storage", "react-native-url-polyfill"]) {
    assert.ok(pkg.dependencies[dep], "missing dependency " + dep);
  }
  assert.ok(!pkg.dependencies["next"], "mobile must not depend on the web app");
});

test("resolveSupabaseConfig fails closed without a valid anon contract", () => {
  assert.equal(resolveSupabaseConfig({}), null);
  assert.equal(resolveSupabaseConfig({ EXPO_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" }), null);
  assert.equal(resolveSupabaseConfig({ EXPO_PUBLIC_SUPABASE_ANON_KEY: "anon" }), null);
  assert.equal(resolveSupabaseConfig({ EXPO_PUBLIC_SUPABASE_URL: "https://evil.example.com", EXPO_PUBLIC_SUPABASE_ANON_KEY: "anon" }), null);
  assert.equal(resolveSupabaseConfig({ EXPO_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", EXPO_PUBLIC_SUPABASE_ANON_KEY: "service_role_secret" }), null);
  const hosted = resolveSupabaseConfig({ EXPO_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", EXPO_PUBLIC_SUPABASE_ANON_KEY: "anon-jwt" });
  assert.deepEqual(hosted, { url: "https://abc.supabase.co", anonKey: "anon-jwt" });
  const local = resolveSupabaseConfig({ EXPO_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", EXPO_PUBLIC_SUPABASE_ANON_KEY: "anon-jwt" });
  assert.deepEqual(local, { url: "http://127.0.0.1:54321", anonKey: "anon-jwt" });
});

test("mobile client uses persisted session on the shared anon + RLS contract", async () => {
  const source = await read("../mobile/src/supabase.ts");
  assert.match(source, /@react-native-async-storage\/async-storage/);
  assert.match(source, /react-native-url-polyfill/);
  assert.match(source, /persistSession: true/);
  assert.match(source, /detectSessionInUrl: false/);
  assert.match(source, /resolveSupabaseConfig/);
});

test("mobile workspace contains no server-only secrets or privileged keys", async () => {
  const entries = await readdir(new URL("../mobile", import.meta.url), { recursive: true });
  // Vendored install/build artifacts are gitignored and never shipped as app
  // source; scanning them yields false positives (e.g. "private key" in the
  // TypeScript compiler's own license header).
  const files = entries.filter(
    (entry) =>
      /\.(ts|tsx|js|json|md)$/.test(entry) &&
      !/^(node_modules|\.expo|dist|build)\//.test(entry),
  );
  assert.ok(files.length > 0);
  const forbidden = /SUPABASE_SERVICE_ROLE_KEY|service_role_key|WHATSAPP_|N8N_|GITHUB_TOKEN|CONTROL_PLANE_|VERAH_OS_|PRIVATE KEY/i;
  for (const file of files) {
    const content = await read("../mobile/" + file);
    assert.doesNotMatch(content, forbidden, "forbidden secret pattern in mobile/" + file);
  }
});

test("root typecheck stays scoped to the web app until the workspace issue lands", async () => {
  const tsconfig = await readJson("../tsconfig.json");
  assert.ok(tsconfig.exclude.includes("mobile"), "root tsconfig must exclude mobile/");
});
