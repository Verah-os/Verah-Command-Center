import { listAiAgents } from "@/services/ai-team";
import { MockAgent } from "@/services/ai-runtime/adapters/MockAgent";
import { listDispatcherJobs } from "@/services/dispatcher";

export type RuntimeExecution = {
  executionId: string;
  dispatcherJobId: string;
  workOrderId: string;
  agentId: string;
  provider: string;
  status: "success" | "error";
  durationMs: number;
  completedAt: string;
};

export type RuntimeSummary = {
  totalExecutions: number;
  completedExecutions: number;
  failedExecutions: number;
  successRate: number | null;
  averageDurationMs: number | null;
  lastExecutionAt: string | null;
};

export type RegisteredRuntimeAgent = {
  agentId: string;
  provider: string;
  status: string;
  capabilities: string[];
  lastExecutionAt: string | null;
  totalExecutions: number;
  errorRate: number | null;
};

export type RuntimeMonitor = {
  summary: RuntimeSummary;
  agents: RegisteredRuntimeAgent[];
  recentExecutions: RuntimeExecution[];
};

const runtimeLogPattern =
  /^AI Runtime executionId=(\S+) status=(success|error)(?: code=\S+)? message=.* durationMs=(\d+)$/;

function parseRuntimeExecution(
  message: string,
  completedAt: string,
  dispatcherJobId: string,
  workOrderId: string,
  agentId: string
): RuntimeExecution | null {
  const match = runtimeLogPattern.exec(message);

  if (!match) {
    return null;
  }

  const durationMs = Number(match[3]);

  if (!Number.isSafeInteger(durationMs) || durationMs < 0) {
    return null;
  }

  return {
    executionId: match[1],
    dispatcherJobId,
    workOrderId,
    agentId,
    provider: agentId === "mock_agent" ? "mock" : "Not available",
    status: match[2] as RuntimeExecution["status"],
    durationMs,
    completedAt
  };
}

function buildSummary(executions: RuntimeExecution[]): RuntimeSummary {
  const completedExecutions = executions.filter((execution) => execution.status === "success").length;
  const failedExecutions = executions.filter((execution) => execution.status === "error").length;
  const totalDurationMs = executions.reduce((total, execution) => total + execution.durationMs, 0);

  return {
    totalExecutions: executions.length,
    completedExecutions,
    failedExecutions,
    successRate: executions.length === 0 ? null : (completedExecutions / executions.length) * 100,
    averageDurationMs: executions.length === 0 ? null : totalDurationMs / executions.length,
    lastExecutionAt: executions[0]?.completedAt ?? null
  };
}

export async function getRuntimeMonitor(): Promise<RuntimeMonitor> {
  const [jobs, registeredAgents] = await Promise.all([listDispatcherJobs(), listAiAgents()]);
  const executions = jobs
    .flatMap((job) =>
      job.logs.flatMap((log) => {
        const execution = parseRuntimeExecution(
          log.message,
          log.createdAt,
          job.id,
          job.workOrderId,
          job.assignedAgent ?? "mock_agent"
        );

        return execution ? [execution] : [];
      })
    )
    .sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt));

  const mockAgent = new MockAgent();
  const agents = [
    ...registeredAgents.filter((agent) => agent.id !== mockAgent.agentId).map((agent) => ({
      agentId: agent.id,
      provider: agent.provider,
      status: agent.status,
      capabilities: agent.capabilities
    })),
    {
      agentId: mockAgent.agentId,
      provider: mockAgent.provider,
      status: "online",
      capabilities: ["runtime_test"]
    }
  ].map((agent): RegisteredRuntimeAgent => {
      const agentExecutions = executions.filter((execution) => execution.agentId === agent.agentId);
      const failures = agentExecutions.filter((execution) => execution.status === "error").length;

      return {
        ...agent,
        lastExecutionAt: agentExecutions[0]?.completedAt ?? null,
        totalExecutions: agentExecutions.length,
        errorRate: agentExecutions.length === 0 ? null : (failures / agentExecutions.length) * 100
      };
    });

  return {
    summary: buildSummary(executions),
    agents,
    recentExecutions: executions.slice(0, 20)
  };
}

export async function getRuntimeSummary(): Promise<RuntimeSummary> {
  return (await getRuntimeMonitor()).summary;
}
