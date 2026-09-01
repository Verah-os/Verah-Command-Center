import { sanitizePayload, sanitizeText } from "./sanitization.ts";
import {
  OpenHandsExecutor,
  type OpenHandsExecutorOptions,
  type OpenHandsReadiness,
  type OpenHandsTransport,
  type OpenHandsTransportResult,
} from "./openhands-executor.ts";
import type { AgentExecutionRequest } from "./types.ts";

export const OPENHANDS_CLOUD_DEFAULT_BASE_URL = "https://app.all-hands.dev";

export type OpenHandsCloudConfig =
  | { enabled: false; reason: string }
  | {
      enabled: true;
      reason: "configured";
      baseUrl: string;
      apiKey: string;
      maxRunningConversations: number;
      requestTimeoutMs: number;
      pollIntervalMs: number;
      maxPolls: number;
    };

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}

// Fail-closed reader: any missing/invalid piece disables the transport; the
// API key is never copied into logs, reasons or serialized diagnostics.
export function readOpenHandsCloudConfig(
  source: Record<string, string | undefined>,
): OpenHandsCloudConfig {
  if (source.NODE_ENV === "production") {
    return { enabled: false, reason: "production_environment" };
  }
  if (source.OPENHANDS_CLOUD_TRANSPORT_ENABLED !== "true") {
    return { enabled: false, reason: "flag_disabled" };
  }
  const apiKey = (
    source.OPENHANDS_CLOUD_API_KEY ?? source.OPENHANDS_API_KEY ?? ""
  ).trim();
  if (!apiKey) return { enabled: false, reason: "api_key_missing" };
  const baseUrl = (
    source.OPENHANDS_CLOUD_BASE_URL ?? OPENHANDS_CLOUD_DEFAULT_BASE_URL
  ).trim().replace(/\/+$/, "");
  if (!/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(baseUrl)) {
    return { enabled: false, reason: "base_url_invalid" };
  }
  return {
    enabled: true,
    reason: "configured",
    baseUrl,
    apiKey,
    maxRunningConversations: boundedInteger(
      source.OPENHANDS_CLOUD_MAX_RUNNING_CONVERSATIONS,
      4,
      1,
      16,
    ),
    requestTimeoutMs: boundedInteger(
      source.OPENHANDS_CLOUD_REQUEST_TIMEOUT_MS,
      15_000,
      1_000,
      60_000,
    ),
    pollIntervalMs: boundedInteger(
      source.OPENHANDS_CLOUD_POLL_INTERVAL_MS,
      5_000,
      250,
      60_000,
    ),
    maxPolls: boundedInteger(source.OPENHANDS_CLOUD_MAX_POLLS, 360, 1, 2_000),
  };
}

export type OpenHandsCloudResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

export type OpenHandsCloudFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal: AbortSignal;
  },
) => Promise<OpenHandsCloudResponse>;

export type OpenHandsCloudTransportOptions = {
  fetchFn?: OpenHandsCloudFetch;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  logger?: (event: Record<string, unknown>) => void;
};

const defaultFetch: OpenHandsCloudFetch = (url, init) =>
  fetch(url, init) as Promise<OpenHandsCloudResponse>;

const defaultSleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("openhands_aborted"));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("openhands_aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });

class CloudHttpError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`openhands_cloud_http_${status}`);
    this.status = status;
  }
}

type ActiveConversation = {
  conversationId: string | null;
  sandboxId: string | null;
};

export class OpenHandsCloudTransport implements OpenHandsTransport {
  private readonly config: OpenHandsCloudConfig;
  private readonly fetchFn: OpenHandsCloudFetch;
  private readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  private readonly logger: (event: Record<string, unknown>) => void;
  private readonly active = new Map<string, ActiveConversation>();

  constructor(
    config: OpenHandsCloudConfig,
    options: OpenHandsCloudTransportOptions = {},
  ) {
    this.config = config;
    this.fetchFn = options.fetchFn ?? defaultFetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.logger = options.logger ?? (() => undefined);
  }

  async readiness(signal: AbortSignal): Promise<OpenHandsReadiness> {
    if (!this.config.enabled) return "offline";
    try {
      await this.request("GET", "/api/v1/users/me", undefined, signal);
    } catch (error) {
      if (error instanceof CloudHttpError && error.status === 429) {
        return "rate_limited";
      }
      return "offline";
    }
    let running: number;
    try {
      const search = await this.request(
        "GET",
        "/api/v1/app-conversations/search?limit=20",
        undefined,
        signal,
      );
      running = extractItems(search).filter((item) =>
        readString(item, "execution_status") === "running"
      ).length;
    } catch {
      // Capacity cannot be verified; fail closed instead of over-committing.
      return "offline";
    }
    return running >= this.config.maxRunningConversations ? "busy" : "ready";
  }

  async execute(
    input: {
      executionId: string;
      request: AgentExecutionRequest;
      integrationSafe: true;
    },
    signal: AbortSignal,
  ): Promise<OpenHandsTransportResult> {
    if (!this.config.enabled) {
      return this.failed("openhands_cloud_disabled");
    }
    const { request } = input;
    const repository = repositoryFromIssueKey(request.task.issueKey);
    if (!repository) return this.failed("openhands_cloud_issue_key_invalid");
    const branch = request.task.branchName?.trim();
    if (!branch) return this.failed("openhands_cloud_branch_required");

    const state: ActiveConversation = { conversationId: null, sandboxId: null };
    this.active.set(input.executionId, state);
    try {
      const started = await this.request("POST", "/api/v1/app-conversations", {
        initial_message: {
          content: [{ type: "text", text: delegationPrompt(request, branch) }],
        },
        selected_repository: repository,
        selected_branch: branch,
      }, signal);
      this.log({
        type: "openhands_cloud_start",
        executionId: input.executionId,
        issueKey: request.task.issueKey,
        branch,
      });

      const conversationId = await this.resolveConversationId(started, signal);
      state.conversationId = conversationId;

      const record = await this.pollConversation(conversationId, state, signal);
      const status = readString(record, "execution_status") ?? "unknown";
      if (status !== "finished") {
        return this.failed("openhands_cloud_conversation_failed", [
          `conversation ${conversationId} ended with status ${status}`,
        ]);
      }
      const events = await this.request(
        "GET",
        `/api/v1/conversation/${conversationId}/events/search?limit=100`,
        undefined,
        signal,
      );
      const texts = assistantTexts(extractItems(events));
      const handoff = texts.at(-1) ?? "";
      const draftPrUrl = texts
        .map((text) => /https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/\d+/.exec(text)?.[0])
        .find((match) => match !== undefined);
      const costUsd = readCostUsd(record);
      return {
        status: "completed",
        handoff,
        costMicrounits: costUsd === undefined
          ? undefined
          : Math.round(costUsd * 1_000_000),
        artifacts: {
          draftPrUrl,
          checks: [],
        },
        logs: [`conversation ${conversationId} finished`],
        externalEffects: [],
      };
    } catch (error) {
      if (signal.aborted) throw error;
      if (error instanceof CloudHttpError) {
        if (error.status === 401 || error.status === 403) {
          return this.failed("openhands_cloud_auth_rejected");
        }
        if (error.status === 429) return this.failed("openhands_cloud_rate_limited");
        return this.failed("openhands_cloud_rejected");
      }
      throw error;
    } finally {
      this.active.delete(input.executionId);
    }
  }

  async cancel(executionId: string): Promise<void> {
    const state = this.active.get(executionId);
    if (!state?.sandboxId || !this.config.enabled) return;
    try {
      await this.request(
        "POST",
        `/api/v1/sandboxes/${state.sandboxId}/pause`,
        undefined,
        AbortSignal.timeout(5_000),
      );
      this.log({ type: "openhands_cloud_paused", executionId });
    } catch (error) {
      this.log({
        type: "openhands_cloud_pause_failed",
        executionId,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  private async resolveConversationId(
    started: unknown,
    signal: AbortSignal,
  ): Promise<string> {
    const direct = readString(started, "app_conversation_id");
    if (direct) return direct;
    const startTaskId = readString(started, "id");
    if (!startTaskId || !this.config.enabled) {
      throw new Error("openhands_cloud_start_task_missing");
    }
    for (let poll = 0; poll < this.config.maxPolls; poll += 1) {
      if (poll > 0) await this.sleep(this.config.pollIntervalMs, signal);
      const tasks = await this.request(
        "GET",
        `/api/v1/app-conversations/start-tasks?ids=${encodeURIComponent(startTaskId)}`,
        undefined,
        signal,
      );
      const task = extractItems(tasks).find((item) =>
        readString(item, "id") === startTaskId
      ) ?? (readString(tasks, "id") === startTaskId ? tasks : null);
      const conversationId = task ? readString(task, "app_conversation_id") : null;
      const status = task ? readString(task, "status") : null;
      if (conversationId) return conversationId;
      if (status && status !== "READY" && status !== "PENDING" && status !== "WORKING") {
        throw new Error("openhands_cloud_start_task_failed");
      }
    }
    throw new Error("openhands_cloud_start_task_timeout");
  }

  private async pollConversation(
    conversationId: string,
    state: ActiveConversation,
    signal: AbortSignal,
  ): Promise<Record<string, unknown>> {
    if (!this.config.enabled) throw new Error("openhands_cloud_disabled");
    for (let poll = 0; poll < this.config.maxPolls; poll += 1) {
      if (poll > 0) await this.sleep(this.config.pollIntervalMs, signal);
      const response = await this.request(
        "GET",
        `/api/v1/app-conversations?ids=${encodeURIComponent(conversationId)}`,
        undefined,
        signal,
      );
      const record = extractItems(response).find((item) =>
        readString(item, "id") === conversationId
        || readString(item, "app_conversation_id") === conversationId
      ) ?? (readString(response, "id") === conversationId && isRecord(response)
        ? response
        : null);
      if (!record) continue;
      const sandboxId = readString(record, "sandbox_id");
      if (sandboxId) state.sandboxId = sandboxId;
      const status = readString(record, "execution_status");
      if (status === "finished" || status === "stopped" || status === "error") {
        return record;
      }
    }
    throw new Error("openhands_cloud_poll_exhausted");
  }

  private async request(
    method: string,
    path: string,
    body: unknown,
    signal: AbortSignal,
  ): Promise<unknown> {
    if (!this.config.enabled) throw new Error("openhands_cloud_disabled");
    const combined = AbortSignal.any([
      signal,
      AbortSignal.timeout(this.config.requestTimeoutMs),
    ]);
    const response = await this.fetchFn(`${this.config.baseUrl}${path}`, {
      method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${this.config.apiKey}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: combined,
    });
    if (!response.ok) throw new CloudHttpError(response.status);
    return response.json();
  }

  private failed(
    errorCode: string,
    logs: readonly string[] = [],
  ): OpenHandsTransportResult {
    this.log({ type: "openhands_cloud_failed", errorCode });
    return { status: "failed", errorCode, logs, externalEffects: [] };
  }

  private log(event: Record<string, unknown>) {
    this.logger(sanitizePayload(event) as Record<string, unknown>);
  }
}

// Factory for Control Plane wiring: returns null when the environment is not
// explicitly and safely configured, so the router simply never registers
// OpenHands Cloud as a candidate (fail closed, no manual copy/paste path).
export function createOpenHandsCloudExecutor(
  source: Record<string, string | undefined>,
  options: OpenHandsCloudTransportOptions & {
    executorOptions?: OpenHandsExecutorOptions;
  } = {},
): OpenHandsExecutor | null {
  const config = readOpenHandsCloudConfig(source);
  if (!config.enabled) return null;
  return new OpenHandsExecutor(
    new OpenHandsCloudTransport(config, options),
    options.executorOptions,
  );
}

function delegationPrompt(request: AgentExecutionRequest, branch: string) {
  const { task, role, modelRoute, context } = request;
  const lines = [
    "You are the OpenHands executor delegated by the VERAH AI Control Plane (EPIC #147 contract).",
    `Issue: ${sanitizeText(task.issueKey, 300)} — ${sanitizeText(task.title, 500)}`,
    `Agent role: ${sanitizeText(role.name, 200)} (${sanitizeText(role.id, 100)})`,
    `Model route selected by the Control Plane: ${sanitizeText(modelRoute.provider, 100)}/${sanitizeText(modelRoute.model, 200)}`,
    "",
    "Mandatory contract:",
    `- Work only on the isolated branch "${sanitizeText(branch, 300)}" created from updated main. Never commit to main and never share branches across issues.`,
    "- Open exactly one Draft PR when done. Never merge, never mark the PR ready for review, never bypass required CI checks, review or security gates.",
    "- No production, no production credentials/secrets, no real payments, no real outbound messages/WhatsApp, no remote migrations, no destructive data operations.",
    "- Stop and report when any HUMAN gate applies; HUMAN gates are fail-closed.",
    "- GitHub and Supabase remain the sources of truth; record executor/model/duration/cost where available.",
    "- Finish with a concise handoff: issue/PR, commit, files changed, focused tests and checks, key decision or invariant, remaining blocker/risk.",
    "",
    "Context references:",
    ...context.slice(0, 20).map((ref) => `- ${sanitizeText(ref, 300)}`),
  ];
  return lines.join("\n");
}

function repositoryFromIssueKey(issueKey: string) {
  const match = /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)#\d+$/.exec(issueKey.trim());
  return match?.[1] ?? null;
}

function extractItems(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord).slice(0, 100);
  }
  if (isRecord(payload) && Array.isArray(payload.items)) {
    return payload.items.filter(isRecord).slice(0, 100);
  }
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: unknown, key: string) {
  if (!isRecord(record)) return undefined;
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readCostUsd(record: Record<string, unknown>) {
  const metrics = isRecord(record.metrics) ? record.metrics : null;
  const value = metrics?.accumulated_cost;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return value;
}

function assistantTexts(events: readonly Record<string, unknown>[]) {
  const texts: string[] = [];
  for (const event of events) {
    if (readString(event, "kind") !== "MessageEvent") continue;
    if (readString(event, "source") !== "assistant") continue;
    const text = messageText(event.message) ?? messageText(event.llm_message);
    if (text) texts.push(sanitizeText(text, 4_000));
  }
  return texts.slice(-10);
}

function messageText(message: unknown) {
  if (!isRecord(message)) return undefined;
  const content = message.content;
  if (typeof content === "string" && content.trim()) return content;
  if (!Array.isArray(content)) return undefined;
  const parts = content
    .filter(isRecord)
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .filter((part) => part.trim());
  return parts.length > 0 ? parts.join("\n") : undefined;
}
