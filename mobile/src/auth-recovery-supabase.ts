import type { AuthFacade } from "./auth-session";
import { getSupabaseClient } from "./supabase";

const RECOVERY_REDIRECT = "verah-dev://auth/callback";

export function withPasswordRecovery(base: AuthFacade): AuthFacade {
  return {
    ...base,
    resetPasswordForEmail: async (email) => {
      const client = getSupabaseClient();
      if (!client) return { error: { message: "Auth indisponível." } };
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: RECOVERY_REDIRECT,
      });
      return { error: error ?? null };
    },
    updatePassword: async (password) => {
      const client = getSupabaseClient();
      if (!client) return { error: { message: "Auth indisponível." } };
      const { error } = await client.auth.updateUser({ password });
      return { error: error ?? null };
    },
  };
}
