import { requireRole } from "@/services/auth/profile";
import { createSupabaseServerClient } from "@/services/supabase/server";
import { readCustomer, readDirectory, readMetrics } from "./read-model";

// Authorize at the data boundary, not only in a parent layout.
// The existing cookie-bound anon client keeps RLS active on every SELECT.
export async function getCustomerMetrics() {
  await requireRole(["admin"]);
  return readMetrics(await createSupabaseServerClient());
}
export async function getCustomerDirectory() {
  await requireRole(["admin"]);
  return readDirectory(await createSupabaseServerClient());
}
export async function getCustomerDetail(id: string) {
  await requireRole(["admin"]);
  return readCustomer(await createSupabaseServerClient(), id);
}
