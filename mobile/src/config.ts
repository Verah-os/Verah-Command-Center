export type MobileEnv = {
  EXPO_PUBLIC_SUPABASE_URL?: string;
  EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
};

export type SupabaseConfig = {
  url: string;
  anonKey: string;
};

const HOSTED_URL = /^https:\/\/[a-z0-9-]+\.supabase\.co(\/|$)/;
const LOCAL_URL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/;

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
