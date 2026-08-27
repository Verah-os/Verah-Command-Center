"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/services/supabase/server";
import { isUserRole, roleHome } from "@/services/auth/access";
import type { Route } from "next";

export async function signInWithEmail(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const audience = String(formData.get("audience") ?? "internal");
  const loginPath = audience === "customer"
    ? "/entrar/cliente"
    : audience === "provider"
      ? "/entrar/prestador"
      : "/login";
  const supabase = await createSupabaseServerClient();

  const { data: auth, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`${loginPath}?error=invalid_credentials` as Route);
  }
  let { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (profileError) {
    await supabase.auth.signOut();
    redirect(`${loginPath}?error=profile_error` as Route);
  }
  if (!profile && audience === "customer") {
    const displayName = String(auth.user.user_metadata?.display_name ?? email.split("@")[0] ?? "Cliente VERAH");
    const { error: onboardingError } = await supabase.rpc("start_customer_onboarding", {
      p_display_name: displayName,
    });
    if (!onboardingError) {
      const result = await supabase.from("user_profiles").select("role").eq("user_id", auth.user.id).maybeSingle();
      profile = result.data;
      profileError = result.error;
    }
  }
  if (!profile && audience === "provider") {
    redirect("/entrar/prestador/cadastro?resume=1" as Route);
  }
  if (profileError || !profile || !isUserRole(profile.role)) {
    await supabase.auth.signOut();
    redirect(`${loginPath}?error=${profile ? "profile_invalid" : "profile_missing"}` as Route);
  }
  if (profile.role === "customer") {
    const { data: onboarding } = await supabase.rpc("refresh_customer_onboarding");
    if ((onboarding as { onboarding_status?: string } | null)?.onboarding_status !== "completed") {
      redirect("/onboarding/cliente" as Route);
    }
  }
  if (profile.role === "provider") {
    const { data: homologation } = await supabase.rpc("get_own_provider_homologation");
    const status = (homologation as { homologation_status?: string } | null)?.homologation_status;
    if (!status || !["pilot_approved", "approved"].includes(status)) {
      redirect("/onboarding/prestador?status=candidate" as Route);
    }
  }
  redirect(roleHome[profile.role] as Route);
}

export async function signUpCustomerWithEmail(formData: FormData) {
  const displayName = String(formData.get("display_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!displayName || password.length < 8) redirect("/entrar/cliente/cadastro?error=invalid_signup" as Route);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) redirect("/entrar/cliente/cadastro?error=signup_failed" as Route);
  if (!data.session) redirect("/entrar/cliente?error=confirm_email");
  const { error: onboardingError } = await supabase.rpc("start_customer_onboarding", {
    p_display_name: displayName,
  });
  if (onboardingError) redirect("/entrar/cliente/cadastro?error=onboarding_failed" as Route);
  redirect("/onboarding/cliente" as Route);
}

export async function signUpProviderApplicationWithEmail(formData: FormData) {
  const legalName = String(formData.get("legal_name") ?? "").trim();
  const tradeName = String(formData.get("trade_name") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!legalName || !city || password.length < 8) redirect("/entrar/prestador/cadastro?error=invalid_signup" as Route);
  const supabase = await createSupabaseServerClient();
  const { data: currentAuth } = await supabase.auth.getUser();
  if (!currentAuth.user) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: legalName } },
    });
    if (error) redirect("/entrar/prestador/cadastro?error=signup_failed" as Route);
    if (!data.session) redirect("/entrar/prestador?error=confirm_email");
  }
  const { error: applicationError } = await supabase.rpc("start_provider_application", {
    p_legal_name: legalName,
    p_trade_name: tradeName,
    p_city: city,
  });
  if (applicationError) redirect("/entrar/prestador/cadastro?error=application_failed" as Route);
  redirect("/onboarding/prestador?status=candidate" as Route);
}

export async function completeCustomerOnboarding(formData: FormData) {
  const displayName = String(formData.get("display_name") ?? "").trim();
  const accepted = formData.get("accept_terms") === "on";
  if (!accepted) redirect("/onboarding/cliente?error=terms_required" as Route);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("complete_customer_basic_onboarding", {
    p_display_name: displayName,
    p_terms_version: "pilot-alpha-onboarding-v1",
  });
  if (error) redirect("/onboarding/cliente?error=save_failed" as Route);
  redirect("/demo/cliente/veiculos");
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
