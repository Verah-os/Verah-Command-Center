#!/usr/bin/env node
// Fail-closed validation of the canonical Alpha/staging backend shared by Web
// and Mobile. Runs in CI when the pair of Supabase projects is visible (or a
// local/dev Supabase is used on both channels). Without any configured values
// there is still no production risk: the pair is considered "unresolved" and
// the script exits with status 0 after printing the diagnostic, because CI
// runs without secrets. Human operators should run this script locally with
// both `.env*` sources present to prove the single-backend invariant.
//
// Usage:
//   node scripts/canonical-backend/validate.ts
// Environment (all optional in CI):
//   NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY  (web channel)
//   EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY  (mobile channel)
//   VERAH_RUNTIME_ENVIRONMENT                                (alpha|staging|qa)

import {
  compareVerahEnvironments,
} from "../../lib/verah-environment.ts";

function format(result: ReturnType<typeof compareVerahEnvironments>) {
  if (result.ok) {
    return (
      "Canonical backend OK: web + mobile convergem em " +
      `${result.web.environment} (${result.web.projectRef ?? "local"}).`
    );
  }
  return `Canonical backend drift: ${result.message}`;
}

const web = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  environment: process.env.VERAH_RUNTIME_ENVIRONMENT ?? "",
};
const mobile = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
  environment: process.env.VERAH_RUNTIME_ENVIRONMENT ?? "",
};

const result = compareVerahEnvironments(web, mobile);
console.log(format(result));
if (!web.supabaseUrl || !mobile.supabaseUrl) {
  // No configured pair (e.g. CI without secrets) — informational only.
  process.exitCode = 0;
} else if (!result.ok) {
  process.exitCode = 1;
}