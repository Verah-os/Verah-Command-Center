"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/services/auth/profile";
import { operateHomologation } from "@/services/provider-homologation/service";

export async function submitHomologation(form: FormData) {
  // Keep authorization redirects outside the mutation error handler.
  await requireRole(["admin"]);
  let feedback = "saved";
  try {
    await operateHomologation(form);
  } catch {
    feedback = "failed";
  }
  revalidatePath("/prestadores");
  const id = form.get("provider_id");
  const query = new URLSearchParams({ feedback });
  if (typeof id === "string") query.set("provider", id);
  redirect(`/prestadores?${query}`);
}
