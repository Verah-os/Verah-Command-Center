import { sanitizePayload, sanitizeText } from "./sanitization.ts";
import type { AgentCheckResult, AgentRun, ControlPlaneGate } from "./types.ts";
import type { UnattendedQueueItem, UnattendedQueueReport } from "./unattended-queue.ts";

export type ExecutorModelMetric = {
  provider: string;
  model: string;
  source: "internal" | "omniroute";
  runs: number;
  reworkAttempts: number;
  costMicrounits: number;
  durationMs: number;
};

export type ExecutorMetric = {
  executorId: string;
  runs: number;
  reworkAttempts: number;
  completed: number;
  blocked: number;
  failedRecoverable: number;
  costMicrounits: number;
  durationMs: number;
  models: ExecutorModelMetric[];
};

export type GateMetrics = {
  auto: number;
  autoPr: number;
  human: number;
  humanBlockers: string[];
};

export type OperationalReportItem = {
  issueKey: string;
  branchName: string;
  status: UnattendedQueueItem["status"];
  gate: ControlPlaneGate | "not_classified";
  attempts: number;
  executors: string[];
  handoffDelivered: boolean;
  draftPrUrl: string | null;
  checks: AgentCheckResult[];
  reviewGate: "passed" | "blocked" | "not_evaluated";
  blocker: string | null;
  externalEffects: number;
};

export type ControlPlaneOperationalReport = {
  schema: "verah.control-plane.operational-report/v1";
  generatedAt: string;
  environment: "non-production";
  killSwitchActive: boolean;
  totals: UnattendedQueueReport;
  perExecutor: ExecutorMetric[];
  gates: GateMetrics;
  items: OperationalReportItem[];
  handoffCoverage: { delivered: number; total: number };
  sourceOfTruth: {
    operational: "github";
    state: "supabase";
    memory: "read_only_non_authoritative";
  };
  safetyPosture: readonly string[];
};

export const OPERATIONAL_SAFETY_POSTURE = Object.freeze([
  "non_production_dry_run_only",
  "no_production_use",
  "no_credentials_or_secrets",
  "no_real_payments",
  "no_real_outbound_messages",
  "no_remote_migrations",
  "no_destructive_data_operations",
  "no_dispatcher_invocation",
  "human_gates_fail_closed",
  "github_remains_operational_source_of_truth",
  "supabase_remains_state_source_of_truth",
  "shared_memory_is_read_only_and_never_authoritative",
]);

export type OperationalReportInput = {
  items: readonly UnattendedQueueItem[];
  totals: UnattendedQueueReport;
  now?: () => number;
};

export function buildOperationalReport(input: OperationalReportInput): ControlPlaneOperationalReport {
  const now = input.now ?? Date.now;
  const items = input.items.map(toReportItem);
  const runs = input.items.flatMap((item) => item.runs);

  return {
    schema: "verah.control-plane.operational-report/v1",
    generatedAt: new Date(now()).toISOString(),
    environment: "non-production",
    killSwitchActive: input.totals.killSwitchActive,
    totals: { ...input.totals },
    perExecutor: executorMetrics(runs),
    gates: gateMetrics(items),
    items,
    handoffCoverage: {
      delivered: runs.filter((run) => typeof run.handoff === "string" && run.handoff.length > 0).length,
      total: runs.length,
    },
    sourceOfTruth: {
      operational: "github",
      state: "supabase",
      memory: "read_only_non_authoritative",
    },
    safetyPosture: OPERATIONAL_SAFETY_POSTURE,
  };
}

export function renderOperationalReportMarkdown(report: ControlPlaneOperationalReport): string {
  const lines: string[] = [
    "# VERAH Control Plane — Operational Report",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Environment: ${report.environment} (dry-run)`,
    `- Kill switch: ${report.killSwitchActive ? "ACTIVE (queue halted)" : "released for this run"}`,
    "",
    "## Totals",
    "",
    `- Completed: ${report.totals.completed}`,
    `- Blocked: ${report.totals.blocked}`,
    `- Dead letter: ${report.totals.deadLetter}`,
    `- Queued: ${report.totals.queued}`,
    `- Retryable: ${report.totals.retryable}`,
    `- Runs: ${report.totals.totalRuns}`,
    `- Rework attempts: ${report.totals.reworkAttempts}`,
    `- Cost (microunits): ${report.totals.totalCostMicrounits}`,
    `- Executor duration (ms): ${report.totals.totalExecutorDurationMs}`,
    `- Standardized handoffs: ${report.handoffCoverage.delivered}/${report.handoffCoverage.total} runs`,
    "",
    "## Gates",
    "",
    `- AUTO: ${report.gates.auto}`,
    `- AUTO_PR: ${report.gates.autoPr}`,
    `- HUMAN (fail-closed, never executed): ${report.gates.human}`,
  ];
  for (const blocker of report.gates.humanBlockers) {
    lines.push(`  - ${blocker}`);
  }
  lines.push("", "## Per-executor metrics", "");
  if (report.perExecutor.length === 0) {
    lines.push("- No executor activity recorded.");
  }
  for (const metric of report.perExecutor) {
    lines.push(
      `- ${metric.executorId}: runs=${metric.runs} rework=${metric.reworkAttempts}`
      + ` completed=${metric.completed}`
      + ` blocked=${metric.blocked} failed_recoverable=${metric.failedRecoverable}`
      + ` cost=${metric.costMicrounits} microunits duration=${metric.durationMs} ms`,
    );
    for (const model of metric.models) {
      lines.push(
        `  - model ${model.provider}/${model.model} (${model.source}):`
        + ` runs=${model.runs} rework=${model.reworkAttempts}`
        + ` cost=${model.costMicrounits} duration=${model.durationMs} ms`,
      );
    }
  }
  lines.push("", "## Queue items", "");
  if (report.items.length === 0) {
    lines.push("- No items processed.");
  }
  for (const item of report.items) {
    lines.push(
      `- ${item.issueKey} [${item.status}] gate=${item.gate} attempts=${item.attempts}`
      + ` branch=${item.branchName} executors=${item.executors.join(",") || "none"}`
      + ` handoff=${item.handoffDelivered ? "yes" : "no"}`
      + (item.draftPrUrl ? ` draftPR=${item.draftPrUrl}` : "")
      + (item.blocker ? ` blocker=${item.blocker}` : ""),
    );
  }
  lines.push(
    "",
    "## Sources of truth",
    "",
    "- GitHub remains the operational queue/history source of truth.",
    "- Supabase remains the state source of truth.",
    "- Shared agent memory is a read-only, non-authoritative cache of curated context.",
    "",
    "## Safety posture",
    "",
  );
  for (const rule of report.safetyPosture) lines.push(`- ${rule}`);
  return `${lines.join("\n")}\n`;
}

function toReportItem(item: UnattendedQueueItem): OperationalReportItem {
  const completed = item.runs.find((run) => run.status === "completed");
  const gate = item.runs[0]?.gate ?? "not_classified";
  return {
    issueKey: item.task.issueKey,
    branchName: item.task.branchName ?? item.task.issueKey,
    status: item.status,
    gate,
    attempts: item.attempts,
    executors: [...new Set(item.runs.map((run) => run.executorId))],
    handoffDelivered: item.runs.some((run) => typeof run.handoff === "string" && run.handoff.length > 0),
    draftPrUrl: completed?.artifacts?.draftPrUrl ?? null,
    checks: [...(completed?.artifacts?.checks ?? item.reviewGate?.checks ?? [])],
    reviewGate: item.reviewGate ? item.reviewGate.status : "not_evaluated",
    blocker: item.blocker,
    externalEffects: item.runs.reduce((total, run) => total + run.externalEffects.length, 0),
  };
}

function executorMetrics(runs: readonly AgentRun[]): ExecutorMetric[] {
  const byExecutor = new Map<string, AgentRun[]>();
  for (const run of runs) {
    const group = byExecutor.get(run.executorId) ?? [];
    group.push(run);
    byExecutor.set(run.executorId, group);
  }
  return [...byExecutor.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([executorId, group]) => ({
      executorId,
      runs: group.length,
      reworkAttempts: countReworkAttempts(group),
      completed: group.filter((run) => run.status === "completed").length,
      blocked: group.filter((run) => run.status === "blocked").length,
      failedRecoverable: group.filter((run) => run.status === "failed_recoverable").length,
      costMicrounits: group.reduce((total, run) => total + (run.costMicrounits ?? 0), 0),
      durationMs: group.reduce((total, run) => total + (run.executorDurationMs ?? 0), 0),
      models: modelMetrics(group),
    }));
}

function modelMetrics(runs: readonly AgentRun[]): ExecutorModelMetric[] {
  const byModel = new Map<string, AgentRun[]>();
  for (const run of runs) {
    if (!run.modelRoute) continue;
    const key = `${run.modelRoute.provider}/${run.modelRoute.model}/${run.modelRoute.source}`;
    const group = byModel.get(key) ?? [];
    group.push(run);
    byModel.set(key, group);
  }
  return [...byModel.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, group]) => {
      const route = group[0].modelRoute;
      return {
        provider: route?.provider ?? "unknown",
        model: route?.model ?? "unknown",
        source: route?.source ?? "internal",
        runs: group.length,
        reworkAttempts: countReworkAttempts(group),
        costMicrounits: group.reduce((total, run) => total + (run.costMicrounits ?? 0), 0),
        durationMs: group.reduce((total, run) => total + (run.executorDurationMs ?? 0), 0),
      };
    });
}

function countReworkAttempts(runs: readonly AgentRun[]): number {
  return runs.filter((run) => run.attempt > 1).length;
}

function gateMetrics(items: readonly OperationalReportItem[]): GateMetrics {
  const humanBlockers = items
    .filter((item) => item.gate === "HUMAN")
    .map((item) => `${item.issueKey}: ${item.blocker ?? "human_gate"}`);
  return {
    auto: items.filter((item) => item.gate === "AUTO").length,
    autoPr: items.filter((item) => item.gate === "AUTO_PR").length,
    human: items.filter((item) => item.gate === "HUMAN").length,
    humanBlockers: humanBlockers.map((blocker) => sanitizeText(blocker, 300)),
  };
}

export function serializeOperationalReport(report: ControlPlaneOperationalReport): string {
  return JSON.stringify(sanitizePayload(report), null, 2);
}
