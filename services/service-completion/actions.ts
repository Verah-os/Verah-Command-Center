"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/services/auth/profile";
import { createSupabaseServerClient } from "@/services/supabase/server";
import { getProviderServiceRequest } from "@/services/service-requests";

const text = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
};
function refresh(id: string) {
  revalidatePath(`/demo/prestador/atendimento/${id}`);
  revalidatePath(`/concierge/${id}`);
  revalidatePath(`/demo/cliente/atendimento/${id}`);
  revalidatePath("/dashboard");
}

export async function providerComplete(form: FormData) {
  const profile = await requireRole(["provider", "admin"]);
  const id = text(form, "requestId");
  const providerId =
    profile.role === "provider" ? profile.providerId : text(form, "providerId");
  const suffix =
    profile.role === "admin" && providerId ? `?provider=${providerId}` : "";
  if (!providerId || !(await getProviderServiceRequest(id, providerId)))
    redirect("/demo/prestador" as Route);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("provider_mark_service_completed", {
    p_service_request_id: id,
    p_completion_notes: text(form, "notes") || null,
  });
  if (error)
    redirect(
      `/demo/prestador/atendimento/${id}${suffix}${suffix ? "&" : "?"}error=${encodeURIComponent(error.message)}` as Route,
    );
  refresh(id);
  redirect(
    `/demo/prestador/atendimento/${id}${suffix}${suffix ? "&" : "?"}completed=1` as Route,
  );
}

export async function conciergeConfirm(form: FormData) {
  await requireRole(["concierge", "admin"]);
  const id = text(form, "requestId"),
    supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("concierge_confirm_service_completion", {
    p_service_request_id: id,
  });
  if (error)
    redirect(
      `/concierge/${id}?error=${encodeURIComponent(error.message)}` as Route,
    );
  refresh(id);
  redirect(`/concierge/${id}?completionConfirmed=1` as Route);
}
export async function submitRating(form: FormData) {
  await requireRole(["customer", "admin"]);
  const id = text(form, "requestId"),
    supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("submit_service_rating", {
    p_service_request_id: id,
    p_rating: Number(text(form, "rating")),
    p_feedback: text(form, "feedback") || null,
  });
  if (error)
    redirect(
      `/demo/cliente/atendimento/${id}?error=${encodeURIComponent(error.message)}` as Route,
    );
  refresh(id);
  redirect(`/demo/cliente/atendimento/${id}?rated=1` as Route);
}
