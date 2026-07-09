"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { env } from "@/lib/env";
import { createSupabaseServerClient } from "@/services/supabase/server";
import type { WorkOrderOrigin, WorkOrderPriority } from "@/types/work-order";

const allowedPriorities: WorkOrderPriority[] = ["Low", "Medium", "High", "Critical"];
const allowedOrigins: WorkOrderOrigin[] = ["Manual", "GitHub", "Dispatcher", "AI"];

function getRequiredValue(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function getWorkOrderId() {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const suffix = randomUUID().slice(0, 8).toUpperCase();

  return `WO-${timestamp}-${suffix}`;
}

function redirectWithError(message: string): never {
  redirect(`/work-orders/new?error=${encodeURIComponent(message)}`);
}

export async function createWorkOrder(formData: FormData) {
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    redirectWithError("Supabase nao configurado.");
  }

  const title = getRequiredValue(formData, "title");
  const description = getRequiredValue(formData, "description");
  const priority = getRequiredValue(formData, "priority") as WorkOrderPriority;
  const originValue = getRequiredValue(formData, "origin") || "Manual";
  const origin = originValue as WorkOrderOrigin;
  const category = getRequiredValue(formData, "category") || "General";
  const owner = getRequiredValue(formData, "owner") || "Unassigned";

  if (!title) {
    redirectWithError("Title obrigatorio.");
  }

  if (!description) {
    redirectWithError("Description obrigatoria.");
  }

  if (!allowedPriorities.includes(priority)) {
    redirectWithError("Priority obrigatoria.");
  }

  if (!allowedOrigins.includes(origin)) {
    redirectWithError("Origin invalida.");
  }

  const id = getWorkOrderId();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("work_orders").insert({
    id,
    title,
    description,
    category,
    status: "Backlog",
    priority,
    owner,
    origin
  });

  if (error) {
    console.error("Failed to create work order", error.message);
    redirectWithError("Nao foi possivel criar a Work Order.");
  }

  revalidatePath("/work-orders");
  revalidatePath("/dispatcher");
  redirect(`/work-orders/${id}`);
}
