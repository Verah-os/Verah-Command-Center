"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  markDispatcherJobCompleted,
  markDispatcherJobFailed,
  retryFailedDispatcherJob,
  runNextDispatcherJob
} from "@/services/dispatcher/engine";

function revalidateDispatcher(jobId?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/dispatcher");

  if (jobId) {
    revalidatePath(`/dispatcher/${jobId}`);
  }
}

function redirectWithFeedback(status: "success" | "error", message: string) {
  redirect(`/dispatcher?status=${status}&message=${encodeURIComponent(message)}`);
}

export async function runDispatcherEngineAction() {
  const result = await runNextDispatcherJob();

  revalidateDispatcher(result.status === "completed" ? result.jobId : undefined);

  if (result.status === "completed") {
    redirectWithFeedback("success", "Job executado com sucesso.");
  }

  redirectWithFeedback("error", result.message);
}

export async function retryFailedDispatcherJobAction(formData: FormData) {
  const jobId = String(formData.get("jobId") ?? "");
  const result = await retryFailedDispatcherJob(jobId);

  revalidateDispatcher(jobId);

  if (result.status === "queued") {
    redirectWithFeedback("success", "Job reenfileirado com sucesso.");
  }

  redirectWithFeedback("error", result.message);
}

export async function markDispatcherJobCompletedAction(formData: FormData) {
  const jobId = String(formData.get("jobId") ?? "");
  const result = await markDispatcherJobCompleted(jobId);

  revalidateDispatcher(jobId);

  if (result.status === "completed") {
    redirectWithFeedback("success", "Job marcado como concluido.");
  }

  redirectWithFeedback("error", result.message);
}

export async function markDispatcherJobFailedAction(formData: FormData) {
  const jobId = String(formData.get("jobId") ?? "");
  const result = await markDispatcherJobFailed(jobId);

  revalidateDispatcher(jobId);

  if (result.status === "failed") {
    redirectWithFeedback("success", "Job marcado como falho.");
  }

  redirectWithFeedback("error", result.message);
}
