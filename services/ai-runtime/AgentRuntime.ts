import { randomUUID } from "node:crypto";
import { AgentRegistry } from "@/services/ai-runtime/AgentRegistry";
import { agentRuntimeErrors } from "@/services/ai-runtime/errors";
import type { AgentJob, AgentResponse } from "@/services/ai-runtime/types";

export class AgentRuntime {
  constructor(private readonly registry: AgentRegistry) {}

  async execute(job: AgentJob): Promise<AgentResponse> {
    const executionId = randomUUID();
    const startedAt = Date.now();

    console.info(`job=${job.jobId} execution=${executionId} agent=${job.agentId} start`);

    try {
      const adapter = this.registry.resolve(job.agentId);

      if (!adapter) {
        return this.errorResponse(job, executionId, startedAt, agentRuntimeErrors.agentNotFound(job.agentId));
      }

      const adapterResponse = await adapter.execute(job);
      const durationMs = Date.now() - startedAt;
      const response: AgentResponse = {
        ...adapterResponse,
        jobId: job.jobId,
        executionId,
        agentId: job.agentId,
        durationMs,
        completedAt: new Date().toISOString(),
        output: adapterResponse.output
          ? { ...adapterResponse.output, executionId }
          : undefined,
        error:
          adapterResponse.status === "error"
            ? adapterResponse.error ?? agentRuntimeErrors.adapterFailure("Adapter returned an invalid error response")
            : undefined
      };

      if (response.status === "error") {
        const error = response.error!;
        console.error(`job=${job.jobId} execution=${executionId} error=${error.code} msg=${error.message}`);
      } else {
        console.info(`job=${job.jobId} execution=${executionId} status=success durationMs=${durationMs}`);
      }

      return response;
    } catch (error) {
      return this.errorResponse(job, executionId, startedAt, agentRuntimeErrors.adapterFailure(error));
    }
  }

  private errorResponse(
    job: AgentJob,
    executionId: string,
    startedAt: number,
    error: NonNullable<AgentResponse["error"]>
  ): AgentResponse {
    const durationMs = Date.now() - startedAt;
    console.error(`job=${job.jobId} execution=${executionId} error=${error.code} msg=${error.message}`);

    return {
      jobId: job.jobId,
      executionId,
      agentId: job.agentId,
      status: "error",
      error,
      durationMs,
      completedAt: new Date().toISOString()
    };
  }
}
