export type DispatcherJobStatus = "queued" | "running" | "completed" | "failed";

export type DispatcherJob = {
  id: string;
  workOrderId: string;
  targetAgent: string;
  status: DispatcherJobStatus;
  payload: Record<string, unknown>;
  startedAt: string | null;
  finishedAt: string | null;
};
