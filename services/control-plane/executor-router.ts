import type {
  AgentExecutionRequest,
  AgentExecutionResult,
  AgentExecutor,
  AgentTask,
  ExecutorAvailability,
} from "./types.ts";

export type ExecutorCandidate = {
  executor: AgentExecutor;
  priority: number;
  estimatedCostMicrounits: number;
  taskKinds?: readonly string[];
};

export type ExecutorRoutingMode = "priority" | "lowest_cost";

export class PolicyExecutorRouter implements AgentExecutor {
  readonly id = "policy-executor-router";
  private readonly candidates: readonly ExecutorCandidate[];
  private readonly mode: ExecutorRoutingMode;
  private readonly selections = new Map<string, AgentExecutor>();
  private readonly reservations = new Map<string, string>();

  constructor(candidates: readonly ExecutorCandidate[], mode: ExecutorRoutingMode = "priority") {
    if (candidates.length === 0) throw new Error("executor_candidates_required");
    const ids = new Set(candidates.map((candidate) => candidate.executor.id));
    if (ids.size !== candidates.length) throw new Error("duplicate_executor_candidate");
    this.candidates = [...candidates];
    this.mode = mode;
  }

  async availability(task?: AgentTask): Promise<ExecutorAvailability> {
    if (!task) return "unavailable";
    const candidates = this.eligible(task);
    if (candidates.length === 0) return "unavailable";

    const observed: ExecutorAvailability[] = [];
    for (const candidate of candidates) {
      const reservedBy = this.reservations.get(candidate.executor.id);
      if (reservedBy && reservedBy !== task.idempotencyKey) {
        observed.push("busy");
        continue;
      }
      this.reservations.set(candidate.executor.id, task.idempotencyKey);
      let availability: ExecutorAvailability;
      try {
        availability = await candidate.executor.availability(task);
      } catch {
        availability = "unavailable";
      }
      observed.push(availability);
      if (availability === "available") {
        this.selections.set(task.idempotencyKey, candidate.executor);
        return "available";
      }
      if (this.reservations.get(candidate.executor.id) === task.idempotencyKey) {
        this.reservations.delete(candidate.executor.id);
      }
    }

    this.selections.delete(task.idempotencyKey);
    if (observed.includes("busy")) return "busy";
    if (observed.includes("rate_limited")) return "rate_limited";
    return "unavailable";
  }

  async execute(request: AgentExecutionRequest): Promise<AgentExecutionResult> {
    const key = request.task.idempotencyKey;
    const executor = this.selections.get(key);
    if (!executor) {
      return {
        status: "failed",
        executorId: this.id,
        errorCode: "executor_selection_missing",
        externalEffects: [],
      };
    }
    try {
      const result = await executor.execute(request);
      return { ...result, executorId: executor.id };
    } finally {
      this.selections.delete(key);
      this.reservations.delete(executor.id);
    }
  }

  async cancel(idempotencyKey: string): Promise<void> {
    const executor = this.selections.get(idempotencyKey);
    try {
      await executor?.cancel?.(idempotencyKey);
    } finally {
      this.selections.delete(idempotencyKey);
      if (executor) this.reservations.delete(executor.id);
    }
  }

  private eligible(task: AgentTask) {
    return this.candidates
      .filter((candidate) => !candidate.taskKinds || candidate.taskKinds.includes(task.kind))
      .sort((left, right) => {
        if (this.mode === "lowest_cost") {
          return left.estimatedCostMicrounits - right.estimatedCostMicrounits
            || left.priority - right.priority;
        }
        return left.priority - right.priority
          || left.estimatedCostMicrounits - right.estimatedCostMicrounits;
      });
  }
}
