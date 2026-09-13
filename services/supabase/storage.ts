import { StorageClient } from "@supabase/storage-js";
import { env } from "@/lib/env";

// High-level Supabase Storage client bound to the authenticated session access
// token, used to interact with private owner-scoped buckets (e.g. vehicle
// documents) without duplicating the canonical storage RLS policies. The
// access token comes from the session user's authenticated server client.
export function createSupabaseServerStorageClient(accessToken: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    apikey: env.supabaseAnonKey,
  };
  return new StorageClient(`${env.supabaseUrl}/storage/v1`, headers);
}