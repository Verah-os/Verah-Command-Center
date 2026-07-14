"use server";
import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/services/supabase/server";
import { requireRole } from "@/services/auth/profile";
export async function assignProvider(formData: FormData) {
  await requireRole(["concierge", "admin"]);
  const serviceRequestId = formData.get("serviceRequestId");
  const providerId = formData.get("providerId");
  if (typeof serviceRequestId !== "string" || typeof providerId !== "string")
    redirect("/concierge" as Route);
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await supabase.rpc("assign_provider_to_service_request", {
    p_service_request_id: serviceRequestId,
    p_provider_id: providerId,
  });
  if (error) {
    const message = error.message.includes("já possui")
      ? "Este atendimento já possui um prestador indicado."
      : "Não foi possível indicar o prestador.";
    redirect(
      `/concierge/${serviceRequestId}?error=${encodeURIComponent(message)}` as Route,
    );
  }
  revalidatePath("/concierge");
  revalidatePath(`/concierge/${serviceRequestId}`);
  revalidatePath("/dashboard");
  revalidatePath("/demo/cliente");
  revalidatePath(`/demo/cliente/atendimento/${serviceRequestId}`);
  revalidatePath("/demo/prestador");
  redirect(`/concierge/${serviceRequestId}?providerAssigned=1` as Route);
}

export async function reassignProvider(formData: FormData) {
  await requireRole(["concierge", "admin"]);
  const serviceRequestId = formData.get("serviceRequestId");
  const providerId = formData.get("providerId");
  const reason = formData.get("reason");
  if (
    typeof serviceRequestId !== "string" ||
    typeof providerId !== "string" ||
    typeof reason !== "string" ||
    !reason.trim()
  )
    redirect("/concierge" as Route);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reassign_provider_to_service_request", {
    p_service_request_id: serviceRequestId,
    p_provider_id: providerId,
    p_reason: reason.trim(),
  });
  if (error)
    redirect(
      `/concierge/${serviceRequestId}?error=${encodeURIComponent(error.message)}` as Route,
    );
  revalidatePath("/concierge");
  revalidatePath(`/concierge/${serviceRequestId}`);
  revalidatePath("/demo/prestador");
  revalidatePath(`/demo/cliente/atendimento/${serviceRequestId}`);
  redirect(`/concierge/${serviceRequestId}?providerReassigned=1` as Route);
}
