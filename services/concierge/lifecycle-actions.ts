"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { requireRole } from "@/services/auth/profile";
import { createSupabaseServerClient } from "@/services/supabase/server";

export async function setServiceRequestPriority(formData: FormData) {
  await requireRole(["concierge", "admin"]);
  const id = requestId(formData);
  const isPriority = formData.get("isPriority") === "true";
  const reason = text(formData, "reason");
  if (isPriority && !reason) lifecycleError(id, "Informe o motivo da prioridade.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_service_request_priority", {
    p_service_request_id: id,
    p_is_priority: isPriority,
    p_reason: reason || null,
  });
  if (error) lifecycleError(id, error.message);
  revalidateLifecycle(id);
  redirect(`/concierge/${id}?priorityUpdated=1` as Route);
}

export async function cancelServiceRequest(formData: FormData) {
  await requireRole(["concierge", "admin"]);
  const id = requestId(formData);
  const reason = text(formData, "reason");
  const notes = text(formData, "notes");
  if (formData.get("confirmation") !== "confirmed")
    lifecycleError(id, "Confirme o cancelamento do atendimento.");
  if (!reason) lifecycleError(id, "Selecione o motivo do cancelamento.");
  if (reason === "other" && !notes)
    lifecycleError(id, "Descreva o motivo do cancelamento.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_service_request", {
    p_service_request_id: id,
    p_reason: reason,
    p_notes: notes || null,
  });
  if (error) lifecycleError(id, error.message);
  revalidateLifecycle(id);
  redirect(`/concierge/${id}?cancelled=1` as Route);
}

export async function reopenServiceRequest(formData: FormData) {
  await requireRole(["concierge", "admin"]);
  const id = requestId(formData);
  const reason = text(formData, "reason");
  if (formData.get("confirmation") !== "confirmed")
    lifecycleError(id, "Confirme a reabertura do atendimento.");
  if (!reason) lifecycleError(id, "Informe o motivo da reabertura.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reopen_service_request", {
    p_service_request_id: id,
    p_reason: reason,
  });
  if (error) lifecycleError(id, error.message);
  revalidateLifecycle(id);
  redirect(`/concierge/${id}?reopened=1` as Route);
}

function requestId(formData: FormData) {
  const id = text(formData, "serviceRequestId");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    redirect("/concierge");
  return id;
}

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function lifecycleError(id: string, message: string): never {
  redirect(`/concierge/${id}?error=${encodeURIComponent(message)}` as Route);
}

function revalidateLifecycle(id: string) {
  revalidatePath("/concierge");
  revalidatePath(`/concierge/${id}`);
  revalidatePath("/demo/cliente");
  revalidatePath(`/demo/cliente/atendimento/${id}`);
  revalidatePath("/demo/prestador");
  revalidatePath(`/demo/prestador/atendimento/${id}`);
  revalidatePath("/dashboard");
}
