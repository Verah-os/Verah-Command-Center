"use server";

import { createHash } from "node:crypto";
import { getCurrentProfileState } from "@/services/auth/profile";
import { createSupabaseServerClient } from "@/services/supabase/server";

export async function getJourneyRevision() {
  const state = await getCurrentProfileState();
  if (state.status !== "authenticated") {
    if (state.status === "error") throw new Error("Journey access unavailable");
    return { session: null, revision: null };
  }
  const supabase = await createSupabaseServerClient();
  // Session-bound client only. RLS decides which rows may affect this revision.
  async function revisions(table: "service_requests" | "service_quotes") {
    const rows: unknown[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from(table).select("id,updated_at")
        .order("id").range(offset, offset + 499);
      if (error || !data) throw new Error("Journey updates unavailable");
      rows.push(...data);
      if (data.length < 500) return rows;
    }
  }
  const rows = await Promise.all([revisions("service_requests"), revisions("service_quotes")]);
  const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  return { session: hash(state.profile), revision: hash(rows) };
}
