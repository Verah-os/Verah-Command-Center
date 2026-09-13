import assert from "node:assert/strict";
import test from "node:test";

import {
  compareVerahEnvironments,
  projectRefFromUrl,
  resolveVerahEnvironment,
} from "../lib/verah-environment.ts";

// #266 — App cliente and Concierge/Concierge web must talk to the SAME
// canonical non-production Supabase backend. These tests prove the shared
// web+mobile environment resolver fails closed whenever the two channels
// are wired to different backends or a forbidden environment.

const STAGING_URL = "https://wxnklnbntgpcncajzpsj.supabase.co";
const OTHER_URL = "https://other-alpha-project.supabase.co";

test("projectRefFromUrl extracts the project ref from a hosted URL", () => {
  assert.equal(projectRefFromUrl(STAGING_URL), "wxnklnbntgpcncajzpsj");
  assert.equal(projectRefFromUrl("http://localhost:54321"), null);
  assert.equal(projectRefFromUrl(""), null);
  assert.equal(projectRefFromUrl("https://not-supabase.example.com"), null);
});

test("resolveVerahEnvironment produces a non-secret descriptor for web and mobile", () => {
  const web = resolveVerahEnvironment(
    { supabaseUrl: STAGING_URL, anonKey: "anon-jwt", environment: "staging" },
    "web",
  );
  assert.equal(web.ok, true);
  if (!web.ok) return;
  assert.deepEqual(web.descriptor, {
    channel: "web",
    environment: "staging",
    projectRef: "wxnklnbntgpcncajzpsj",
    url: STAGING_URL,
  });

  const mobile = resolveVerahEnvironment(
    {
      supabaseUrl: STAGING_URL,
      anonKey: "anon-jwt",
      environment: "staging",
    },
    "mobile",
  );
  assert.equal(mobile.ok, true);
  if (!mobile.ok) return;
  assert.equal(mobile.descriptor.projectRef, "wxnklnbntgpcncajzpsj");
});

test("compareVerahEnvironments accepts a convergent web+mobile pair", () => {
  const result = compareVerahEnvironments(
    { supabaseUrl: STAGING_URL, anonKey: "anon-jwt", environment: "alpha" },
    { supabaseUrl: STAGING_URL, anonKey: "anon-jwt", environment: "alpha" },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.web.environment, "alpha");
  assert.equal(result.mobile.environment, "alpha");
  assert.equal(result.web.projectRef, "wxnklnbntgpcncajzpsj");
  assert.equal(result.mobile.projectRef, "wxnklnbntgpcncajzpsj");
});

test("compareVerahEnvironments fails closed on project-ref drift between channels", () => {
  const result = compareVerahEnvironments(
    { supabaseUrl: STAGING_URL, anonKey: "anon-jwt", environment: "staging" },
    { supabaseUrl: OTHER_URL, anonKey: "anon-jwt", environment: "staging" },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.message, /Drift de backend entre canais/);
});

test("compareVerahEnvironments fails closed on environment-label drift", () => {
  const result = compareVerahEnvironments(
    { supabaseUrl: STAGING_URL, anonKey: "anon-jwt", environment: "alpha" },
    { supabaseUrl: STAGING_URL, anonKey: "anon-jwt", environment: "staging" },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.message, /Drift de ambiente entre canais/);
});

test("compareVerahEnvironments fails closed on a production/anonymous backend", () => {
  assert.equal(
    resolveVerahEnvironment(
      { supabaseUrl: STAGING_URL, anonKey: "anon-jwt", environment: "production" },
      "web",
    ).ok,
    false,
  );
  assert.equal(
    resolveVerahEnvironment(
      { supabaseUrl: "https://evil.example.com/project", anonKey: "anon-jwt", environment: "staging" },
      "mobile",
    ).ok,
    false,
  );
  assert.equal(
    resolveVerahEnvironment(
      { supabaseUrl: STAGING_URL, anonKey: "service_role_secret", environment: "staging" },
      "web",
    ).ok,
    false,
  );
  assert.equal(
    resolveVerahEnvironment(
      { supabaseUrl: "", anonKey: "", environment: "staging" },
      "web",
    ).ok,
    false,
  );
});

test("mobile descriptor matches the shared web resolver for the same build env", async () => {
  const { resolveVerahEnvironmentDescriptor: mobileResolve } = await import(
    "../mobile/src/config.ts"
  );
  const mobile = mobileResolve({
    EXPO_PUBLIC_SUPABASE_URL: STAGING_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "anon-jwt",
    EXPO_PUBLIC_SUPABASE_ENVIRONMENT: "staging",
  });
  assert.notEqual(mobile, null);
  const shared = resolveVerahEnvironment(
    { supabaseUrl: STAGING_URL, anonKey: "anon-jwt", environment: "staging" },
    "mobile",
  );
  assert.equal(shared.ok, true);
  if (!shared.ok) return;
  assert.equal(mobile?.projectRef, shared.descriptor.projectRef);
  assert.equal(mobile?.environment, shared.descriptor.environment);
});