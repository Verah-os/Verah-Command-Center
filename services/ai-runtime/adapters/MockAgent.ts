import { randomUUID } from "node:crypto";
import type { AgentAdapter } from "@/services/ai-runtime/adapters/AgentAdapter";
import type { AgentJob, AgentResponse } from "@/services/ai-runtime/types";

export class MockAgent implements AgentAdapter {
  readonly agentId = "mock_agent";
  readonly provider = "mock";

  async execute(job: AgentJob): Promise<AgentResponse> {
    const executionId = randomUUID();

    return {
      jobId: job.jobId,
      executionId,
      agentId: this.agentId,
      status: "success",
      output: {
        message: "Hello VERAH",
        agent: this.agentId,
        provider: this.provider,
        executionId,
        tokens: 0
      },
      durationMs: 0,
      completedAt: new Date().toISOString()
    };
  }
}
