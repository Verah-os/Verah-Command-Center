export type MobileEnv = {
  EXPO_PUBLIC_SUPABASE_URL?: string;
  EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
  EXPO_PUBLIC_SUPABASE_ENVIRONMENT?: string;
};

export type SupabaseConfig = {
  url: string;
  anonKey: string;
};

export type VerahEnvironmentDescriptor = {
  channel: "mobile";
  environment: "alpha" | "staging" | "qa";
  projectRef: string | null;
  url: string;
};

const HOSTED_URL = /^https:\/\/([a-z0-9-]+)\.supabase\.co(\/|$)/;
const LOCAL_URL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/;
const ALLOWED_ENVIRONMENTS = new Set<string>(["alpha", "staging", "qa"]);
const FORBIDDEN_ENVIRONMENT = /^(production|prod|live|main)(\s|$)/i;

// Fail closed: without a valid public anon contract the app must not start
// any backend interaction. Server-side keys are never acceptable here.
export function resolveSupabaseConfig(env: MobileEnv): SupabaseConfig | null {
  const url = (env.EXPO_PUBLIC_SUPABASE_URL ?? "").trim();
  const anonKey = (env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  if (!url || !anonKey) return null;
  if (!HOSTED_URL.test(url) && !LOCAL_URL.test(url)) return null;
  if (anonKey.includes("service_role")) return null;
  return { url, anonKey };
}

export function projectRefFromUrl(url: string): string | null {
  const value = (url ?? "").trim();
  if (!value) return null;
  const hosted = HOSTED_URL.exec(value);
  return hosted ? hosted[1] : null;
}

// Non-secret, smoke-friendly descriptor of the environment the app build was
// wired to. Never contains keys; the project ref is derived from the public URL.
export function resolveVerahEnvironmentDescriptor(
  env: MobileEnv,
): VerahEnvironmentDescriptor | null {
  const config = resolveSupabaseConfig(env);
  if (!config) return null;
  const label = (env.EXPO_PUBLIC_SUPABASE_ENVIRONMENT ?? "staging")
    .trim()
    .toLowerCase();
  if (
    FORBIDDEN_ENVIRONMENT.test(label) ||
    !ALLOWED_ENVIRONMENTS.has(label)
  ) {
    return null;
  }
  return {
    channel: "mobile",
    environment: label as VerahEnvironmentDescriptor["environment"],
    projectRef: projectRefFromUrl(config.url),
    url: config.url,
  };
}
