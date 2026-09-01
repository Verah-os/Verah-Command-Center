import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveSupabaseConfig } from "./config";

let cached: SupabaseClient | null = null;

// Same Supabase project as the Command Center: anon key + RLS + RPCs.
// No parallel backend, no server-side secrets in the app.
export function getSupabaseClient(): SupabaseClient | null {
  if (cached) return cached;
  const config = resolveSupabaseConfig(process.env);
  if (!config) return null;
  cached = createClient(config.url, config.anonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  return cached;
}
