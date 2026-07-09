export type DispatcherJobStatus = "queued" | "running" | "completed" | "failed";

export type DispatcherJobLog = {
  message: string;
  createdAt: string;
};

export type DispatcherJob = {
  id: string;
  workOrderId: string;
  targetAgent: string;
  assignedAgent: string | null;
  status: DispatcherJobStatus;
  payload: Record<string, unknown>;
  logs: DispatcherJobLog[];
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
