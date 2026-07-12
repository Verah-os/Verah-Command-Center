"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/services/supabase/server";
import { roleHome } from "@/services/auth/profile";
import type { UserRole } from "@/types/user-profile";
import type { Route } from "next";

export async function signInWithEmail(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const supabase = await createSupabaseServerClient();

  const { data: auth, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=invalid_credentials`);
  }
  const { data: profile } = await supabase.from("user_profiles").select("role").eq("user_id", auth.user.id).maybeSingle();
  if (!profile) {
    await supabase.auth.signOut();
    redirect("/login?error=profile_missing");
  }
  redirect(roleHome[profile.role as UserRole] as Route);
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
