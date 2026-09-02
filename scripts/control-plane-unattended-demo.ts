/**
 * Phase 8 (#147) — end-to-end unattended Control Plane demonstration.
 *
 * Non-production, dry-run only. Drives the full chain with synthetic GitHub
 * events and fixture adapters: queue -> lease -> role -> model router ->
 * executor (with fallback) -> review gates -> operational report.
 *
 * No dispatcher, no network, no credentials, no real side effects.
 *
 * Usage: node --experimental-strip-types scripts/control-plane-unattended-demo.ts
 * Exit code: 0 when the demo completes with zero safety violations, 1 otherwise.
 */

import { pathToFileURL } from "node:url";

import {
  AgentRoleRegistry,
  EXECUTOR_SIDE_EFFECT_CONTRACT_VIOLATION,
  GuardedControlPlane,
  InMemoryAgentLeaseStore,
} from "../services/control-plane/foundation.ts";
import { PolicyExecutorRouter } from "../services/control-plane/executor-router.ts";
import { CostAwareModelRouter } from "../services/control-plane/model-cost-router.ts";
import { OpenHandsExecutor } from "../services/control-plane/openhands-executor.ts";
import {
  buildOperationalReport,
  renderOperationalReportMarkdown,
  serializeOperationalReport,
  type ControlPlaneOperationalReport,
} from "../services/control-plane/operational-report.ts";
import {
  createFixtureProductSquadAgents,
  CrossFunctionalProductSquad,
} from "../services/control-plane/product-squad.ts";
import {
  createFixtureReviewAgents,
  IndependentReviewGate,
} from "../services/control-plane/review-gates.ts";
import { LangflowControlPlaneAdapter, UnattendedControlPlaneQueue } from "../services/control-plane/unattended-queue.ts";
import type { AgentTask } from "../services/control-plane/types.ts";

export type UnattendedDemoResult = {
  report: ControlPlaneOperationalReport;
  markdown: string;
  json: string;
  safetyViolations: string[];
};

function demoTask(number: number, overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    issueKey: `Verah-os/Verah-Command-Center#demo-${number}`,
    idempotencyKey: `demo-${number}`,
    title: `Synthetic unattended task ${number}`,
    roleId: "coding",
    kind: "isolated_code",
    branchName: `agent/demo-${number}`,
    effects: ["local_files", "repository_branch", "sandbox"],
    contextRefs: ["AGENTS.md", `fixture:${number}`],
    ...overrides,
  };
}

export async function runUnattendedDemo(now: () => number = Date.now): Promise<UnattendedDemoResult> {
  const codexFixture = {
    id: "codex",
    async availability() {
      return "unavailable" as const;
    },
    async execute() {
      return { status: "failed" as const, errorCode: "codex_never_reached", externalEffects: [] as const };
    },
  };

  const openhands = new OpenHandsExecutor({
    async readiness() {
      return "ready";
    },
    async execute({ request }) {
      if (request.task.title.includes("persistent")) {
        return { status: "failed", errorCode: "fixture_persistent_failure", externalEffects: [] };
      }
      return {
        status: "completed",
        handoff: `handoff: ${request.task.issueKey} completed by openhands (${request.modelRoute.provider}/${request.modelRoute.model})`,
        costMicrounits: 20,
        artifacts: {
          draftPrUrl: `https://github.com/Verah-os/Verah-Command-Center/pull/${request.task.issueKey.split("#")[1]}`,
          checks: [{ name: "Required", status: "passed" }],
        },
        externalEffects: [],
      };
    },
  });

  const executorRouter = new PolicyExecutorRouter([
    { executor: codexFixture, priority: 1, estimatedCostMicrounits: 30 },
    { executor: openhands, priority: 2, estimatedCostMicrounits: 20 },
  ]);

  const modelRouter = new CostAwareModelRouter([
    { provider: "fixture", model: "gpt-fixture-low", priority: 1, estimatedCostMicrounits: 5 },
    { provider: "fixture", model: "gpt-fixture-high", priority: 2, estimatedCostMicrounits: 50 },
  ]);

  const plane = new GuardedControlPlane(
    new AgentRoleRegistry(),
    new InMemoryAgentLeaseStore(),
    modelRouter,
    { async loadContext(task) { return task.contextRefs ?? []; } },
    executorRouter,
    { enabled: true, killSwitch: false, dryRun: true, leaseTtlMs: 60_000, now },
  );

  const queue = new UnattendedControlPlaneQueue(
    plane,
    { enabled: true, killSwitch: false, dryRun: true, maxAttempts: 2 },
    new IndependentReviewGate(createFixtureReviewAgents(now), now),
    new CrossFunctionalProductSquad(createFixtureProductSquadAgents()),
  );
  const adapter = new LangflowControlPlaneAdapter(queue);

  // 1. Eligible AUTO task: Codex unavailable -> OpenHands fallback completes it.
  adapter.accept({ source: "github", deliveryId: "demo-1", task: demoTask(1) });
  // 2. Duplicate delivery of the same issue must be deduplicated.
  adapter.accept({ source: "github", deliveryId: "demo-1-duplicate", task: demoTask(1) });
  // 3. HUMAN-gated task must stop fail-closed before any executor runs.
  adapter.accept({
    source: "github",
    deliveryId: "demo-2",
    task: demoTask(2, { title: "Synthetic payment fixture", effects: ["real_payment"] }),
  });
  // 4. Persistently failing task must dead-letter after bounded retries (rework recorded).
  adapter.accept({
    source: "github",
    deliveryId: "demo-3",
    task: demoTask(3, { title: "Synthetic persistent failure fixture" }),
  });

  await adapter.run();

  const report = buildOperationalReport({ items: queue.snapshot(), totals: queue.report(), now });
  const safetyViolations = findSafetyViolations(report, queue.snapshot());
  return {
    report,
    markdown: renderOperationalReportMarkdown(report),
    json: serializeOperationalReport(report),
    safetyViolations,
  };
}

export function findSafetyViolations(
  report: ControlPlaneOperationalReport,
  items: ReturnType<UnattendedControlPlaneQueue["snapshot"]>,
): string[] {
  const violations: string[] = [];
  if (report.environment !== "non-production") violations.push("environment_not_non_production");
  for (const item of items) {
    for (const run of item.runs) {
      if (!run.dryRun) violations.push(`run_not_dry_run:${run.id}`);
      if (run.externalEffects.length > 0) violations.push(`external_effects:${run.id}`);
      // GuardedControlPlane sanitizes recorded externalEffects into an empty
      // list, so the blocker is the durable evidence of an attempted side effect.
      if (run.blocker === EXECUTOR_SIDE_EFFECT_CONTRACT_VIOLATION) {
        violations.push(`attempted_external_effects:${run.id}`);
      }
    }
    const humanRuns = item.runs.filter((run) => run.gate === "HUMAN");
    if (humanRuns.some((run) => run.status === "completed" || run.status === "failed_recoverable")) {
      violations.push(`human_gate_executed:${item.task.issueKey}`);
    }
  }
  const branches = report.items.map((item) => item.branchName);
  if (new Set(branches).size !== branches.length) violations.push("shared_branch_detected");
  return violations;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const result = await runUnattendedDemo();
  console.log(result.markdown);
  console.log("---");
  console.log(result.json);
  if (result.safetyViolations.length > 0) {
    console.error(`SAFETY VIOLATIONS: ${result.safetyViolations.join(", ")}`);
    process.exit(1);
  }
  console.log("Demo completed with zero safety violations (non-production, dry-run).");
}
