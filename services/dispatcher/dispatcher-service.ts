import { env } from "@/lib/env";
import { createSupabaseServerClient } from "@/services/supabase/server";
import type { DispatcherJob, DispatcherJobLog } from "@/types/dispatcher-job";

export type DispatcherStats = {
  queued: number;
  running: number;
  completed: number;
};

type DispatcherJobRow = {
  id: string;
  work_order_id: string;
  target_agent: string;
  assigned_agent: string | null;
  status: DispatcherJob["status"];
  payload: Record<string, unknown>;
  logs: unknown;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

const dispatcherJobColumns =
  "id,work_order_id,target_agent,assigned_agent,status,payload,logs,started_at,finished_at,created_at,updated_at";

function isSupabaseConfigured() {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

function normalizeLogs(value: unknown): DispatcherJobLog[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const log = item as Record<string, unknown>;

    if (typeof log.message !== "string" || typeof log.createdAt !== "string") {
      return [];
    }

    return [
      {
        message: log.message,
        createdAt: log.createdAt
      }
    ];
  });
}

function toDispatcherJob(row: DispatcherJobRow): DispatcherJob {
  return {
    id: row.id,
    workOrderId: row.work_order_id,
    targetAgent: row.target_agent,
    assignedAgent: row.assigned_agent,
    status: row.status,
    payload: row.payload,
    logs: normalizeLogs(row.logs),
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listDispatcherJobs(): Promise<DispatcherJob[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("dispatcher_jobs")
    .select(dispatcherJobColumns)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Failed to load dispatcher jobs", error.message);
    return [];
  }

  return ((data ?? []) as DispatcherJobRow[]).map(toDispatcherJob);
}

export async function getDispatcherJobById(id: string): Promise<DispatcherJob | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("dispatcher_jobs")
    .select(dispatcherJobColumns)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Failed to load dispatcher job", error.message);
    return null;
  }

  return data ? toDispatcherJob(data as DispatcherJobRow) : null;
}

export async function getDispatcherStats(): Promise<DispatcherStats> {
  const jobs = await listDispatcherJobs();

  return {
    queued: jobs.filter((job) => job.status === "queued").length,
    running: jobs.filter((job) => job.status === "running").length,
    completed: jobs.filter((job) => job.status === "completed").length
  };
}
