"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/services/auth/profile";
import { operateHomologation } from "@/services/provider-homologation/service";
import { uploadHomologationEvidence } from "@/services/provider-homologation/evidence";

export async function submitEvidence(form: FormData) {
  await requireRole(["admin"]);
  let feedback = "uploaded";
  try {
    await uploadHomologationEvidence(form);
  } catch {
    feedback = "upload_failed";
  }
  revalidatePath("/prestadores");
  const query = new URLSearchParams({ feedback });
  const id = form.get("provider_id");
  if (typeof id === "string") query.set("provider", id);
  redirect(`/prestadores?${query}`);
}

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
