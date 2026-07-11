import type { AgentError } from "@/services/ai-runtime/types";

export const agentRuntimeErrors = {
  agentNotFound(agentId: string): AgentError {
    return {
      code: "AGENT_NOT_FOUND",
      message: `Agent not found: ${agentId}`
    };
  },
  adapterFailure(error: unknown): AgentError {
    return {
      code: "ADAPTER_FAILURE",
      message: error instanceof Error ? error.message : "Unknown adapter failure"
    };
  }
};
