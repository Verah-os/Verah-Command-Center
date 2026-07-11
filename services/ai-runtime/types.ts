export type AgentJob = {
  jobId: string;
  workOrderId: string;
  agentId: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type AgentError = {
  code: "AGENT_NOT_FOUND" | "ADAPTER_FAILURE";
  message: string;
};

export type AgentResponse = {
  jobId: string;
  executionId: string;
  agentId: string;
  status: "success" | "error";
  output?: Record<string, unknown>;
  error?: AgentError;
  durationMs: number;
  completedAt: string;
};
