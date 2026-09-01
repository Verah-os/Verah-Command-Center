import { sanitizePayload, sanitizeText } from "./sanitization.ts";
import type {
  AgentExecutionRequest,
  AgentExecutionResult,
  AgentExecutor,
  ExecutorAvailability,
} from "./types.ts";

export type OpenHandsReadiness =
  | "ready"
  | "busy"
  | "offline"
  | "rate_limited";

export type OpenHandsTransportResult = {
  status: "completed" | "failed";
  handoff?: string;
  errorCode?: string;
  costMicrounits?: number;
  logs?: readonly string[];
  externalEffects?: readonly string[];
};

export type OpenHandsTransport = {
  readiness(signal: AbortSignal): Promise<OpenHandsReadiness>;
  execute(
    input: {
      executionId: string;
      request: AgentExecutionRequest;
      integrationSafe: true;
    },
    signal: AbortSignal,
  ): Promise<OpenHandsTransportResult>;
  cancel?(executionId: string): Promise<void>;
};

export type OpenHandsAuditLogger = (event: Record<string, unknown>) => void;

export type OpenHandsExecutorOptions = {
  healthTimeoutMs?: number;
  executionTimeoutMs?: number;
  now?: () => number;
  logger?: OpenHandsAuditLogger;
};

type CancellationReason = "manual" | "timeout";

export class OpenHandsExecutor implements AgentExecutor {
  readonly id = "openhands";
  private readonly transport: OpenHandsTransport;
  private readonly healthTimeoutMs: number;
  private readonly executionTimeoutMs: number;
  private readonly now: () => number;
  private readonly logger: OpenHandsAuditLogger;
  private readonly active = new Map<
    string,
    { controller: AbortController; reason: CancellationReason | null }
  >();

  constructor(transport: OpenHandsTransport, options: OpenHandsExecutorOptions = {}) {
    this.transport = transport;
    this.healthTimeoutMs = positiveTimeout(options.healthTimeoutMs ?? 2_000);
    this.executionTimeoutMs = positiveTimeout(options.executionTimeoutMs ?? 15 * 60_000);
    this.now = options.now ?? Date.now;
    this.logger = options.logger ?? (() => undefined);
  }

  async availability(): Promise<ExecutorAvailability> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.healthTimeoutMs);
    try {
      const readiness = await abortable(
        this.transport.readiness(controller.signal),
        controller.signal,
      );
      return normalizeReadiness(readiness);
    } catch (error) {
      this.log({ type: "openhands_readiness_failed", error: errorMessage(error) });
      return "unavailable";
    } finally {
      clearTimeout(timer);
    }
  }

  async execute(request: AgentExecutionRequest): Promise<AgentExecutionResult> {
    if (request.dryRun !== true) {
      return { status: "failed", errorCode: "openhands_dry_run_required", externalEffects: [] };
    }

    const executionId = request.task.idempotencyKey;
    if (this.active.has(executionId)) {
      return { status: "failed", errorCode: "openhands_execution_already_active", externalEffects: [] };
    }

    const startedAt = this.now();
    const state = { controller: new AbortController(), reason: null as CancellationReason | null };
    this.active.set(executionId, state);
    const timer = setTimeout(() => {
      state.reason = "timeout";
      state.controller.abort();
    }, this.executionTimeoutMs);

    try {
      const result = await abortable(
        this.transport.execute(
          { executionId, request, integrationSafe: true },
          state.controller.signal,
        ),
        state.controller.signal,
      );
      const durationMs = Math.max(0, this.now() - startedAt);
      this.logTransportOutput(executionId, result.logs ?? []);

      if ((result.externalEffects?.length ?? 0) > 0) {
        return {
          status: "failed",
          errorCode: "openhands_side_effect_contract_violation",
          durationMs,
          externalEffects: result.externalEffects,
        };
      }

      return {
        status: result.status,
        handoff: sanitizeText(result.handoff ?? ""),
        errorCode: sanitizeOptionalCode(result.errorCode),
        costMicrounits: validCost(result.costMicrounits),
        durationMs,
        externalEffects: [],
      };
    } catch (error) {
      const durationMs = Math.max(0, this.now() - startedAt);
      if (state.controller.signal.aborted) {
        await this.cancelTransport(executionId);
        return {
          status: "failed",
          errorCode: state.reason === "timeout" ? "openhands_timeout" : "openhands_cancelled",
          durationMs,
          externalEffects: [],
        };
      }
      this.log({ type: "openhands_execution_failed", executionId, error: errorMessage(error) });
      return {
        status: "failed",
        errorCode: normalizeExecutionError(error),
        durationMs,
        externalEffects: [],
      };
    } finally {
      clearTimeout(timer);
      this.active.delete(executionId);
    }
  }

  async cancel(idempotencyKey: string): Promise<void> {
    const state = this.active.get(idempotencyKey);
    if (!state) return;
    state.reason = "manual";
    state.controller.abort();
  }

  private async cancelTransport(executionId: string) {
    try {
      await this.transport.cancel?.(executionId);
    } catch (error) {
      this.log({ type: "openhands_cancel_failed", executionId, error: errorMessage(error) });
    }
  }

  private logTransportOutput(executionId: string, logs: readonly string[]) {
    for (const message of logs.slice(0, 50)) {
      this.log({ type: "openhands_log", executionId, message: sanitizeText(message, 2_000) });
    }
  }

  private log(event: Record<string, unknown>) {
    this.logger(sanitizePayload(event) as Record<string, unknown>);
  }
}

function normalizeReadiness(readiness: OpenHandsReadiness): ExecutorAvailability {
  if (readiness === "ready") return "available";
  if (readiness === "busy") return "busy";
  if (readiness === "rate_limited") return "rate_limited";
  return "unavailable";
}

function positiveTimeout(value: number) {
  if (!Number.isFinite(value) || value < 1) throw new Error("invalid_openhands_timeout");
  return Math.floor(value);
}

function validCost(value: number | undefined) {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0) return undefined;
  return Math.floor(value);
}

function sanitizeOptionalCode(value: string | undefined) {
  return value ? sanitizeText(value, 120) : undefined;
}

function errorMessage(error: unknown) {
  return sanitizeText(error instanceof Error ? error.message : "unknown_openhands_error", 500);
}

function normalizeExecutionError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("429") || message.includes("rate") || message.includes("quota")) {
    return "openhands_rate_limited";
  }
  if (message.includes("busy") || message.includes("occupied")) return "openhands_busy";
  return "openhands_unavailable";
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error("openhands_aborted"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error("openhands_aborted"));
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}
