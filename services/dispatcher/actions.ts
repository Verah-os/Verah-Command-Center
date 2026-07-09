"use server";

import { revalidatePath } from "next/cache";
import { runNextDispatcherJob } from "@/services/dispatcher/engine";

export async function runDispatcherEngineAction() {
  const result = await runNextDispatcherJob();

  revalidatePath("/dashboard");
  revalidatePath("/dispatcher");

  if (result.status === "completed") {
    revalidatePath(`/dispatcher/${result.jobId}`);
  }
}
