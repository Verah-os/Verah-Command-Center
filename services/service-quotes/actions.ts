"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/services/auth/profile";
import { createSupabaseServerClient } from "@/services/supabase/server";
import { getProviderServiceRequest } from "@/services/service-requests";

const text = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

export async function saveQuote(form: FormData) {
  const profile = await requireRole(["provider", "admin"]);
  const requestId = text(form, "requestId") ?? "";
  const providerId =
    profile.role === "provider" ? profile.providerId : text(form, "providerId");
  const suffix =
    profile.role === "admin" && providerId ? `?provider=${providerId}` : "";
  if (!providerId)
    redirect(
      `/demo/prestador/atendimento/${requestId}?error=Perfil%20de%20prestador%20sem%20vínculo` as Route,
    );
  if (!(await getProviderServiceRequest(requestId, providerId)))
    redirect("/demo/prestador" as Route);

  let items: unknown;
  try {
    items = JSON.parse(text(form, "itemsJson") ?? "[]");
  } catch {
    redirect(
      `/demo/prestador/atendimento/${requestId}${suffix}${suffix ? "&" : "?"}error=Itens%20inválidos` as Route,
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_service_quote_draft", {
    p_service_request_id: requestId,
    p_provider_id: providerId,
    p_items: items,
    p_estimated_duration: text(form, "estimatedDuration"),
    p_technical_notes: text(form, "technicalNotes"),
    p_customer_summary: text(form, "customerSummary"),
    p_warranty_text: text(form, "warrantyText"),
    p_valid_until: text(form, "validUntil"),
  });
  if (error)
    redirect(
      `/demo/prestador/atendimento/${requestId}${suffix}${suffix ? "&" : "?"}error=${encodeURIComponent(error.message)}` as Route,
    );
  if (form.get("intent") === "submit") {
    const { error: submitError } = await supabase.rpc("submit_service_quote", {
      p_quote_id: data,
    });
    if (submitError)
      redirect(
        `/demo/prestador/atendimento/${requestId}${suffix}${suffix ? "&" : "?"}error=${encodeURIComponent(submitError.message)}` as Route,
      );
  }
  revalidatePath(`/demo/prestador/atendimento/${requestId}`);
  revalidatePath(`/demo/cliente/atendimento/${requestId}`);
  revalidatePath(`/concierge/${requestId}`);
  redirect(
    `/demo/prestador/atendimento/${requestId}${suffix}${suffix ? "&" : "?"}saved=1` as Route,
  );
}

export async function decideQuote(form: FormData) {
  await requireRole(["customer", "admin"]);
  const id = text(form, "quoteId") ?? "",
    requestId = text(form, "requestId") ?? "",
    intent = text(form, "intent"),
    note = text(form, "note");
  const supabase = await createSupabaseServerClient();
  const fn =
    intent === "approve"
      ? "approve_service_quote"
      : "request_quote_clarification";
  const { error } = await supabase.rpc(fn, {
    p_quote_id: id,
    p_customer_decision_note: note,
  });
  if (error)
    redirect(
      `/demo/cliente/atendimento/${requestId}?error=${encodeURIComponent(error.message)}` as Route,
    );
  revalidatePath(`/demo/cliente/atendimento/${requestId}`);
  revalidatePath(`/concierge/${requestId}`);
  revalidatePath("/dashboard");
  redirect(
    `/demo/cliente/atendimento/${requestId}?decision=${intent}` as Route,
  );
}
