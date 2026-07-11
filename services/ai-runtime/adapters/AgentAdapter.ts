import type { AgentJob, AgentResponse } from "@/services/ai-runtime/types";

export interface AgentAdapter {
  readonly agentId: string;
  readonly provider: string;
  execute(job: AgentJob): Promise<AgentResponse>;
}
