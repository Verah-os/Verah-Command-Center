import { createControlPlaneExecutorRouter } from "./composition.ts";
import type { ExecutorCandidate } from "./executor-router.ts";
import {
  AgentRoleRegistry,
  GuardedControlPlane,
  InMemoryAgentLeaseStore,
} from "./foundation.ts";
import {
  fetchOperationalQueue,
  issueToQueueEvent,
  openPullRequestExistsForBranch,
  readControlPlaneRuntimeConfig,
  type ControlPlaneRuntimeConfig,
  type GitHubQueueFetch,
} from "./github-queue.ts";
import { CostAwareModelRouter } from "./model-cost-router.ts";
import type { OpenHandsCloudTransportOptions } from "./openhands-cloud-transport.ts";
import type { OpenHandsExecutorOptions } from "./openhands-executor.ts";
import {
  buildOperationalReport,
  renderOperationalReportMarkdown,
  type ControlPlaneOperationalReport,
} from "./operational-report.ts";
import {
  createFixtureProductSquadAgents,
  CrossFunctionalProductSquad,
} from "./product-squad.ts";
import {
  createFixtureReviewAgents,
  IndependentReviewGate,
} from "./review-gates.ts";
import type { AgentMemory } from "./types.ts";
import {
  UnattendedControlPlaneQueue,
  type UnattendedQueueReport,
} from "./unattended-queue.ts";

// Recorded model route for unattended delegations. OpenHands Cloud selects
// the concrete LLM inside its own conversation; the Control Plane records a
// single deterministic internal route for observability.
const RUNTIME_MODEL_CANDIDATES = [
  {
    provider: "openhands",
    model: "cloud-managed",
    priority: 1,
    estimatedCostMicrounits: 1_000_000,
  },
] as const;

// Context passthrough: curated context refs are already attached to the task
// by the intake; shared memory stays read-only and never a source of truth.
const passthroughMemory: AgentMemory = {
  async loadContext(task) {
    return task.contextRefs ?? [];
  },
};

export type ControlPlaneRuntimeCycleResult = {
  cycle: number;
  queueStatus: "ready" | "locked" | "error";
  selectedIssueKey: string | null;
  skippedReason: string | null;
  report: UnattendedQueueReport;
};

export type ControlPlaneRuntime = {
  readonly config: Extract<ControlPlaneRuntimeConfig, { enabled: true }>;
  readonly queue: UnattendedControlPlaneQueue;
  runCycle(cycle: number): Promise<ControlPlaneRuntimeCycleResult>;
  run(): Promise<ControlPlaneOperationalReport>;
  requestStop(): void;
  report(): ControlPlaneOperationalReport;
  reportMarkdown(): string;
};

export type ControlPlaneRuntimeOptions = {
  primaryCandidates?: readonly ExecutorCandidate[];
  openhands?: OpenHandsCloudTransportOptions & {
    executorOptions?: OpenHandsExecutorOptions;
  };
  fetchFn?: GitHubQueueFetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  logger?: (event: Record<string, unknown>) => void;
};

// The single non-production runtime composition (#170): existing Control
// Plane, unattended queue, leases, gates and reporting around the existing
// createControlPlaneExecutorRouter. Returns null (fail closed) when the
// environment is disabled/misconfigured or no executor is available — the
// host must refuse to start instead of running an empty Control Plane.
export function createControlPlaneRuntime(
  source: Record<string, string | undefined>,
  options: ControlPlaneRuntimeOptions = {},
): ControlPlaneRuntime | null {
  const runtimeConfig = readControlPlaneRuntimeConfig(source);
  if (!runtimeConfig.enabled) return null;
  // Explicitly narrowed binding: discriminated-union narrowing of the outer
  // const does not propagate into the async closures below.
  const config: Extract<ControlPlaneRuntimeConfig, { enabled: true }> =
    runtimeConfig;

  const router = createControlPlaneExecutorRouter(source, {
    primaryCandidates: options.primaryCandidates,
    openhands: options.openhands,
  });
  if (!router) return null;

  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const logger = options.logger ?? (() => undefined);

  const plane = new GuardedControlPlane(
    new AgentRoleRegistry(),
    new InMemoryAgentLeaseStore(),
    new CostAwareModelRouter(RUNTIME_MODEL_CANDIDATES),
    passthroughMemory,
    router,
    // Policy was already enforced fail-closed at the config boundary above;
    // the executor contract itself requires dryRun: true end to end.
    { enabled: true, killSwitch: false, dryRun: true, leaseTtlMs: config.leaseTtlMs, now },
  );
  const queue = new UnattendedControlPlaneQueue(
    plane,
    {
      enabled: true,
      killSwitch: false,
      dryRun: true,
      maxAttempts: config.maxAttempts,
      maxParallel: 1,
    },
    new IndependentReviewGate(createFixtureReviewAgents(now), now),
    new CrossFunctionalProductSquad(createFixtureProductSquadAgents()),
  );

  // In-process guard for one Issue -> one executor -> one isolated branch;
  // the open-PR check in runCycle covers process restarts.
  const enqueuedIssueKeys = new Set<string>();
  let stopRequested = false;

  async function runCycle(cycle: number): Promise<ControlPlaneRuntimeCycleResult> {
    // (#179 audit) Per-cycle fault confinement: a failed queue fetch skips
    // selection for this cycle instead of killing run(); gates still fail
    // closed, the loop keeps recurring.
    let selection: Awaited<ReturnType<typeof fetchOperationalQueue>>;
    try {
      selection = await fetchOperationalQueue(config, {
        fetchFn: options.fetchFn,
      });
    } catch (error) {
      logger({
        type: "control_plane_queue_fetch_failed",
        cycle,
        error: error instanceof Error ? error.message : "unknown",
      });
      const report = await queue.drain(config.maxQueueSteps);
      return {
        cycle,
        queueStatus: "error",
        selectedIssueKey: null,
        skippedReason: "github_queue_fetch_failed",
        report,
      };
    }

    let selectedIssueKey: string | null = null;
    let skippedReason: string | null = null;

    if (selection.status === "locked") {
      skippedReason = "repository_delivery_lock";
      logger({ type: "control_plane_cycle", cycle, queueStatus: "locked", lockIssue: selection.issue.number });
    } else {
      const candidate = selection.candidates.find(
        (issue) => !enqueuedIssueKeys.has(`${config.repository}#${issue.number}`),
      );
      if (candidate) {
        const event = issueToQueueEvent(candidate, config);
        const branch = event.task.branchName ?? "";
        let alreadyDelegated: boolean;
        try {
          alreadyDelegated = await openPullRequestExistsForBranch(config, branch, {
            fetchFn: options.fetchFn,
          });
        } catch (error) {
          // Fail closed: without the branch check we cannot prove the
          // one-issue/one-branch invariant, so this cycle selects nothing.
          alreadyDelegated = true;
          logger({
            type: "control_plane_branch_check_failed",
            cycle,
            issueKey: event.task.issueKey,
            error: error instanceof Error ? error.message : "unknown",
          });
        }
        if (alreadyDelegated) {
          skippedReason = "branch_already_delegated";
          enqueuedIssueKeys.add(event.task.issueKey);
        } else {
          queue.enqueue(event);
          enqueuedIssueKeys.add(event.task.issueKey);
          selectedIssueKey = event.task.issueKey;
          logger({
            type: "control_plane_cycle",
            cycle,
            queueStatus: "ready",
            selectedIssueKey,
            branch,
          });
        }
      } else {
        skippedReason = "no_eligible_issue";
        logger({ type: "control_plane_cycle", cycle, queueStatus: "ready", selectedIssueKey: null });
      }
    }

    const report = await queue.drain(config.maxQueueSteps);
    return {
      cycle,
      queueStatus: selection.status === "locked" ? "locked" : "ready",
      selectedIssueKey,
      skippedReason,
      report,
    };
  }

  function report(): ControlPlaneOperationalReport {
    return buildOperationalReport({
      items: queue.snapshot(),
      totals: queue.report(),
      now,
    });
  }

  async function run(): Promise<ControlPlaneOperationalReport> {
    for (let cycle = 1; cycle <= config.maxCycles; cycle += 1) {
      if (stopRequested) break;
      await runCycle(cycle);
      if (stopRequested || cycle >= config.maxCycles) break;
      await sleep(config.pollIntervalMs);
    }
    return report();
  }

  return {
    config,
    queue,
    runCycle,
    run,
    requestStop() {
      stopRequested = true;
    },
    report,
    reportMarkdown() {
      return renderOperationalReportMarkdown(report());
    },
  };
}
