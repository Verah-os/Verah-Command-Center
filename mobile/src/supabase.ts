import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveSupabaseConfig } from "./config";
import type { AuthFacade } from "./auth-session";

let cached: SupabaseClient | null = null;
let cachedFacade: AuthFacade | null = null;

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

// Real binding from SupabaseClient to the pure auth facade consumed by the
// session state machine. Returns null when fail-closed (no public config).
export function getAuthFacade(): AuthFacade | null {
  if (cachedFacade) return cachedFacade;
  const client = getSupabaseClient();
  if (!client) return null;
  const { auth } = client;
  cachedFacade = {
    getSession: async () => {
      const { data } = await auth.getSession();
      return { session: data.session };
    },
    onAuthStateChange: (listener) => {
      const { data } = auth.onAuthStateChange((event, session) =>
        listener(event, session),
      );
      return data.subscription;
    },
    signIn: (email, password) =>
      auth
        .signInWithPassword({ email, password })
        .then(({ error }) => ({ error: error ?? null })),
    signUp: (email, password) =>
      auth.signUp({ email, password }).then(({ error }) => ({ error: error ?? null })),
    signOut: () => auth.signOut().then(({ error }) => ({ error: error ?? null })),
  };
  return cachedFacade;
}
