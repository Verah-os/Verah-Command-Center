import { classifyControlPlaneGate, GuardedControlPlane } from "./foundation.ts";
import { sanitizeText } from "./sanitization.ts";
import type { AgentRun, AgentTask } from "./types.ts";

export type QueueItemStatus =
  | "queued"
  | "running"
  | "retryable"
  | "completed"
  | "blocked"
  | "dead_letter";

export type GitHubQueueEvent = {
  source: "github";
  deliveryId: string;
  task: AgentTask;
};

export type UnattendedQueueItem = {
  deliveryId: string;
  task: AgentTask;
  status: QueueItemStatus;
  attempts: number;
  blocker: string | null;
  runs: AgentRun[];
};

export type UnattendedQueueReport = {
  queued: number;
  retryable: number;
  completed: number;
  blocked: number;
  deadLetter: number;
  totalRuns: number;
  killSwitchActive: boolean;
};

type QueueOptions = {
  enabled?: boolean;
  killSwitch?: boolean;
  dryRun?: boolean;
  maxAttempts?: number;
};

export class UnattendedControlPlaneQueue {
  private readonly plane: GuardedControlPlane;
  private readonly items = new Map<string, UnattendedQueueItem>();
  private readonly issueDeliveries = new Map<string, string>();
  private readonly options: Required<QueueOptions>;

  constructor(plane: GuardedControlPlane, options: QueueOptions = {}) {
    this.plane = plane;
    this.options = {
      enabled: options.enabled ?? false,
      killSwitch: options.killSwitch ?? true,
      dryRun: options.dryRun ?? true,
      maxAttempts: positiveAttempts(options.maxAttempts ?? 2),
    };
  }

  enqueue(event: GitHubQueueEvent) {
    if (event.source !== "github") throw new Error("github_source_required");
    if (!event.deliveryId.trim()) throw new Error("delivery_id_required");
    const duplicate = this.items.get(event.deliveryId);
    if (duplicate) return { item: duplicate, deduplicated: true };

    const activeDelivery = this.issueDeliveries.get(event.task.issueKey);
    if (activeDelivery) {
      const active = this.items.get(activeDelivery);
      if (active && !terminal(active.status)) return { item: active, deduplicated: true };
    }

    const item: UnattendedQueueItem = {
      deliveryId: event.deliveryId,
      task: Object.freeze({ ...event.task }),
      status: "queued",
      attempts: 0,
      blocker: null,
      runs: [],
    };
    this.items.set(event.deliveryId, item);
    this.issueDeliveries.set(event.task.issueKey, event.deliveryId);
    return { item, deduplicated: false };
  }

  async processNext(): Promise<UnattendedQueueItem | null> {
    if (!this.options.enabled || this.options.killSwitch || !this.options.dryRun) return null;
    const item = [...this.items.values()].find((candidate) =>
      candidate.status === "queued" || candidate.status === "retryable");
    if (!item) return null;

    item.status = "running";
    item.attempts += 1;
    const attemptTask: AgentTask = {
      ...item.task,
      idempotencyKey: `${item.task.idempotencyKey}:attempt:${item.attempts}`,
    };
    const run = await this.plane.run(attemptTask);
    item.runs.push(run);
    item.blocker = run.blocker ?? null;

    if (run.status === "completed") {
      item.status = "completed";
    } else if (run.gate === "HUMAN") {
      item.status = "blocked";
    } else if (item.attempts >= this.options.maxAttempts) {
      item.status = "dead_letter";
    } else {
      item.status = "retryable";
    }
    return item;
  }

  async drain(maxSteps = 100): Promise<UnattendedQueueReport> {
    if (!Number.isInteger(maxSteps) || maxSteps < 1) throw new Error("invalid_queue_step_limit");
    for (let step = 0; step < maxSteps; step += 1) {
      const processed = await this.processNext();
      if (!processed) break;
    }
    return this.report();
  }

  report(): UnattendedQueueReport {
    const values = [...this.items.values()];
    return {
      queued: values.filter((item) => item.status === "queued").length,
      retryable: values.filter((item) => item.status === "retryable").length,
      completed: values.filter((item) => item.status === "completed").length,
      blocked: values.filter((item) => item.status === "blocked").length,
      deadLetter: values.filter((item) => item.status === "dead_letter").length,
      totalRuns: values.reduce((total, item) => total + item.runs.length, 0),
      killSwitchActive: !this.options.enabled || this.options.killSwitch || !this.options.dryRun,
    };
  }

  snapshot() {
    return [...this.items.values()].map((item) => ({
      ...item,
      task: { ...item.task },
      runs: [...item.runs],
    }));
  }
}

export class LangflowControlPlaneAdapter {
  private readonly queue: UnattendedControlPlaneQueue;

  constructor(queue: UnattendedControlPlaneQueue) {
    this.queue = queue;
  }

  accept(input: unknown) {
    const event = normalizeGitHubQueueEvent(input);
    const gate = classifyControlPlaneGate(event.task);
    return { ...this.queue.enqueue(event), gate };
  }

  run() {
    return this.queue.drain();
  }

  report() {
    return this.queue.report();
  }
}

function positiveAttempts(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 10) {
    throw new Error("invalid_queue_attempt_limit");
  }
  return value;
}

function terminal(status: QueueItemStatus) {
  return status === "completed" || status === "blocked" || status === "dead_letter";
}

function normalizeGitHubQueueEvent(input: unknown): GitHubQueueEvent {
  if (!input || typeof input !== "object") throw new Error("invalid_github_event");
  const event = input as Record<string, unknown>;
  if ("command" in event) throw new Error("arbitrary_commands_forbidden");
  if (event.source !== "github" || typeof event.deliveryId !== "string") {
    throw new Error("invalid_github_event");
  }
  if (!event.task || typeof event.task !== "object") throw new Error("invalid_agent_task");
  const task = event.task as Record<string, unknown>;
  if ("command" in task || "commands" in task || "script" in task) {
    throw new Error("arbitrary_commands_forbidden");
  }
  const required = ["issueKey", "idempotencyKey", "title", "roleId", "kind"] as const;
  if (required.some((key) => typeof task[key] !== "string" || !(task[key] as string).trim())) {
    throw new Error("invalid_agent_task");
  }
  const effects = optionalStringArray(task.effects, "invalid_task_effects");
  const contextRefs = optionalStringArray(task.contextRefs, "invalid_context_refs");
  return {
    source: "github",
    deliveryId: sanitizeText(event.deliveryId, 200),
    task: {
      issueKey: sanitizeText(task.issueKey as string, 300),
      idempotencyKey: sanitizeText(task.idempotencyKey as string, 300),
      title: sanitizeText(task.title as string, 500),
      roleId: sanitizeText(task.roleId as string, 100),
      kind: sanitizeText(task.kind as string, 100),
      effects,
      contextRefs,
    },
  };
}

function optionalStringArray(value: unknown, errorCode: string) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 50 || value.some((item) => typeof item !== "string")) {
    throw new Error(errorCode);
  }
  return value.map((item) => sanitizeText(item, 300));
}
