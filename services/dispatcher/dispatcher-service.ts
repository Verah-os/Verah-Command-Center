import { env } from "@/lib/env";
import { createSupabaseServerClient } from "@/services/supabase/server";
import type { DispatcherJob } from "@/types/dispatcher-job";

export type DispatcherStats = {
  queued: number;
  running: number;
  completed: number;
};

type DispatcherJobRow = {
  id: string;
  work_order_id: string;
  target_agent: string;
  status: DispatcherJob["status"];
  payload: Record<string, unknown>;
  started_at: string | null;
  finished_at: string | null;
};

const dispatcherJobColumns =
  "id,work_order_id,target_agent,status,payload,started_at,finished_at";

function isSupabaseConfigured() {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

function toDispatcherJob(row: DispatcherJobRow): DispatcherJob {
  return {
    id: row.id,
    workOrderId: row.work_order_id,
    targetAgent: row.target_agent,
    status: row.status,
    payload: row.payload,
    startedAt: row.started_at,
    finishedAt: row.finished_at
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
    .order("started_at", { ascending: false, nullsFirst: false });

  if (error) {
    console.error("Failed to load dispatcher jobs", error.message);
    return [];
  }

  return ((data ?? []) as DispatcherJobRow[]).map(toDispatcherJob);
}

export async function getDispatcherStats(): Promise<DispatcherStats> {
  const jobs = await listDispatcherJobs();

  return {
    queued: jobs.filter((job) => job.status === "queued").length,
    running: jobs.filter((job) => job.status === "running").length,
    completed: jobs.filter((job) => job.status === "completed").length
  };
}
