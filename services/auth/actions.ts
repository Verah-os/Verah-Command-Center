"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/services/supabase/server";
import { isUserRole, roleHome } from "@/services/auth/access";
import type { Route } from "next";

export async function signInWithEmail(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const supabase = await createSupabaseServerClient();

  const { data: auth, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=invalid_credentials`);
  }
  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (profileError) {
    await supabase.auth.signOut();
    redirect("/login?error=profile_error");
  }
  if (!profile || !isUserRole(profile.role)) {
    await supabase.auth.signOut();
    redirect(`/login?error=${profile ? "profile_invalid" : "profile_missing"}`);
  }
  redirect(roleHome[profile.role] as Route);
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
