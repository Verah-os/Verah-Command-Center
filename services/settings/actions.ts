"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { createSupabaseServerClient } from "@/services/supabase/server";

function getRequiredValue(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function redirectWithFeedback(status: "success" | "error", message: string): never {
  redirect(`/settings?status=${status}&message=${encodeURIComponent(message)}`);
}

export async function updateSystemSetting(formData: FormData) {
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    redirectWithFeedback("error", "Supabase nao configurado.");
  }

  const id = getRequiredValue(formData, "id");
  const value = getRequiredValue(formData, "value");

  if (!id) {
    redirectWithFeedback("error", "Configuracao invalida.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("system_settings")
    .update({ value })
    .eq("id", id)
    .eq("is_editable", true);

  if (error) {
    console.error("Failed to update system setting", error.message);
    redirectWithFeedback("error", "Nao foi possivel atualizar a configuracao.");
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  redirectWithFeedback("success", "Configuracao atualizada.");
}
