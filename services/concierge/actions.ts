"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { createSupabaseServerClient } from "@/services/supabase/server";

export async function acceptServiceRequest(formData: FormData) {
  const id = formData.get("serviceRequestId");
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) redirect("/concierge?error=Atendimento%20inválido." as Route);

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase.rpc("accept_service_request", { p_service_request_id: id });
  if (error) {
    const message = error.message.includes("já foi assumido") ? "Este atendimento já foi assumido." : "Não foi possível assumir o atendimento.";
    redirect(`/concierge/${id}?error=${encodeURIComponent(message)}` as Route);
  }

  const result = Array.isArray(data) ? data[0] : data;
  revalidatePath("/concierge"); revalidatePath(`/concierge/${id}`); revalidatePath("/dashboard");
  revalidatePath("/demo/cliente"); revalidatePath(`/demo/cliente/atendimento/${id}`); revalidatePath("/work-orders");
  redirect(`/concierge/${id}?accepted=1&workOrderId=${encodeURIComponent(result?.work_order_id ?? "")}` as Route);
}
