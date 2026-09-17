"use client";

import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";
import { requireCanonicalWebEnvironment } from "@/lib/verah-environment";

export function createSupabaseBrowserClient() {
  requireCanonicalWebEnvironment({ supabaseUrl: env.supabaseUrl, anonKey: env.supabaseAnonKey, environment: env.supabaseEnvironment });
  return createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
}
