import { env } from "@/lib/env";
import { AgentRegistry, AgentRuntime, MockAgent, type AgentJob } from "@/services/ai-runtime";
import { getDispatcherJobById } from "@/services/dispatcher/dispatcher-service";
import { createSupabaseServerClient } from "@/services/supabase/server";
import { getWorkOrderById } from "@/services/work-orders";

type StartEngineResponse =
  | {
      status: "running";
      jobId: string;
      agentId: string;
      agentName: string;
    }
  | {
      status: "empty_queue";
    }
  | {
      status: "no_agent";
      jobId: string;
    };

type FinishEngineResponse = {
  status: "completed" | "failed" | "not_found";
  jobId?: string;
  agentId?: string;
};

type ManualControlResponse = {
  status: "queued" | "completed" | "failed" | "not_found";
  jobId?: string;
};

export type DispatcherEngineResult =
  | {
      status: "completed";
      jobId: string;
      agentId: string;
    }
  | {
      status: "empty_queue" | "no_agent" | "not_configured" | "failed";
      message: string;
    };

export type DispatcherControlResult =
  | {
      status: "queued" | "completed" | "failed";
      jobId: string;
    }
  | {
      status: "not_configured" | "not_found" | "error";
      message: string;
    };

export type AiRuntimeDispatcherResult =
  | {
      status: "completed" | "failed";
      jobId: string;
      executionId: string;
    }
  | {
      status: "not_configured" | "not_found" | "incompatible" | "persistence_error";
      message: string;
    };

function isSupabaseConfigured() {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function callManualControlRpc(rpcName: string, jobId: string): Promise<DispatcherControlResult> {
  if (!isSupabaseConfigured()) {
    return {
      status: "not_configured",
      message: "Supabase nao configurado."
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(rpcName, { job_id: jobId });

  if (error) {
    console.error(`Failed to run dispatcher control ${rpcName}`, error.message);
    return {
      status: "error",
      message: "Nao foi possivel executar a acao."
    };
  }

  const result = data as ManualControlResponse;

  if (result.status === "not_found") {
    return {
      status: "not_found",
      message: "Job nao encontrado para esta acao."
    };
  }

  return {
    status: result.status,
    jobId: result.jobId ?? jobId
  };
}

export async function retryFailedDispatcherJob(jobId: string) {
  return callManualControlRpc("dispatcher_engine_retry_failed_job", jobId);
}

export async function markDispatcherJobCompleted(jobId: string) {
  return callManualControlRpc("dispatcher_engine_mark_job_completed", jobId);
}

export async function markDispatcherJobFailed(jobId: string) {
  return callManualControlRpc("dispatcher_engine_mark_job_failed", jobId);
}

export async function runDispatcherJobWithAiRuntime(jobId: string): Promise<AiRuntimeDispatcherResult> {
  if (!isSupabaseConfigured()) {
    return { status: "not_configured", message: "Supabase nao configurado." };
  }

  const dispatcherJob = await getDispatcherJobById(jobId);

  if (!dispatcherJob) {
    return { status: "not_found", message: "Job nao encontrado." };
  }

  if (dispatcherJob.status !== "queued" && dispatcherJob.status !== "failed") {
    return { status: "incompatible", message: "O AI Runtime aceita apenas jobs queued ou failed." };
  }

  const workOrder = await getWorkOrderById(dispatcherJob.workOrderId);

  if (!workOrder) {
    return { status: "not_found", message: "Work Order relacionada nao encontrada." };
  }

  const job: AgentJob = {
    jobId: dispatcherJob.id,
    workOrderId: workOrder.id,
    agentId: "mock_agent",
    payload: {
      category: workOrder.category,
      origin: workOrder.origin
    },
    createdAt: new Date().toISOString()
  };

  const registry = new AgentRegistry();
  registry.register(new MockAgent());
  const runtime = new AgentRuntime(registry);
  const response = await runtime.execute(job);
  const supabase = await createSupabaseServerClient();
  const outputMessage = typeof response.output?.message === "string" ? response.output.message : null;
  const { data, error } = await supabase.rpc("dispatcher_complete_ai_runtime_job", {
    job_id: dispatcherJob.id,
    execution_id: response.executionId,
    succeeded: response.status === "success",
    duration_ms: response.durationMs,
    result_message: outputMessage,
    error_code: response.error?.code ?? null,
    error_message: response.error?.message ?? null
  });

  if (error) {
    console.error("Failed to persist AI Runtime result", error.message);
    return { status: "persistence_error", message: "Nao foi possivel salvar o resultado do AI Runtime." };
  }

  const persisted = data as { status: "completed" | "failed" | "not_found" };

  if (persisted.status === "not_found") {
    return { status: "not_found", message: "O job mudou de estado antes da conclusao." };
  }

  return {
    status: persisted.status,
    jobId: dispatcherJob.id,
    executionId: response.executionId
  };
}

export async function runNextDispatcherJob(): Promise<DispatcherEngineResult> {
  if (!isSupabaseConfigured()) {
    return {
      status: "not_configured",
      message: "Supabase nao configurado."
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: startData, error: startError } = await supabase.rpc("dispatcher_engine_start_next_job");

  if (startError) {
    console.error("Failed to start dispatcher job", startError.message);
    return {
      status: "failed",
      message: "Nao foi possivel iniciar o job."
    };
  }

  const started = startData as StartEngineResponse;

  if (started.status === "empty_queue") {
    return {
      status: "empty_queue",
      message: "Nenhum job em fila."
    };
  }

  if (started.status === "no_agent") {
    return {
      status: "no_agent",
      message: "Nenhum agente disponivel."
    };
  }

  await wait(2500);

  const { data: finishData, error: finishError } = await supabase.rpc("dispatcher_engine_finish_job", {
    job_id: started.jobId,
    agent_id: started.agentId,
    succeeded: true
  });

  if (finishError) {
    console.error("Failed to finish dispatcher job", finishError.message);
    return {
      status: "failed",
      message: "Nao foi possivel concluir o job."
    };
  }

  const finished = finishData as FinishEngineResponse;

  if (finished.status !== "completed") {
    return {
      status: "failed",
      message: "O job nao foi concluido."
    };
  }

  return {
    status: "completed",
    jobId: started.jobId,
    agentId: started.agentId
  };
}
