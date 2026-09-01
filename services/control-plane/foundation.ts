import { sanitizePayload } from "./sanitization.ts";
import type {
  AgentExecutor,
  AgentLease,
  AgentMemory,
  AgentRole,
  AgentRun,
  AgentTask,
  ControlPlaneAuditEvent,
  ControlPlaneGate,
  LeaseClaim,
  ModelRouter,
} from "./types.ts";

const AUTO_KINDS = new Set([
  "documentation",
  "isolated_code",
  "isolated_ui",
  "small_refactor",
  "test",
]);
const AUTO_PR_KINDS = new Set([
  "authorization",
  "external_integration",
  "migration_file",
  "shared_contract",
]);
const HUMAN_EFFECTS = new Set([
  "credentials",
  "destructive_data",
  "external_commitment",
  "production_deploy",
  "real_message",
  "real_payment",
  "remote_migration",
]);
const KNOWN_EFFECTS = new Set([
  "documentation",
  "local_files",
  "repository_branch",
  "sandbox",
  ...HUMAN_EFFECTS,
]);

export const VERAH_CURATED_ROLES: readonly AgentRole[] = [
  {
    id: "coding",
    name: "Software Engineer",
    capabilities: ["architecture", "backend", "frontend"],
    reviewStatus: "internal-approved",
  },
  {
    id: "design",
    name: "Product Designer",
    capabilities: ["ui", "ux", "brand"],
    reviewStatus: "internal-approved",
  },
  {
    id: "research",
    name: "Research Agent",
    capabilities: ["evidence", "synthesis"],
    reviewStatus: "internal-approved",
  },
  {
    id: "qa",
    name: "QA Engineer",
    capabilities: ["testing", "verification"],
    reviewStatus: "internal-approved",
  },
  {
    id: "product",
    name: "Product Manager",
    capabilities: ["scope", "acceptance-criteria"],
    reviewStatus: "internal-approved",
  },
  {
    id: "security",
    name: "Security Engineer",
    capabilities: ["threat-model", "authorization"],
    reviewStatus: "internal-approved",
  },
];

export class AgentRoleRegistry {
  private readonly roles = new Map<string, AgentRole>();

  constructor(roles: readonly AgentRole[] = VERAH_CURATED_ROLES) {
    if (roles.length === 0 || roles.length > 12) throw new Error("invalid_role_registry_size");
    for (const role of roles) {
      if (this.roles.has(role.id)) throw new Error("duplicate_agent_role");
      this.roles.set(role.id, Object.freeze({ ...role }));
    }
  }

  select(id: string) {
    const role = this.roles.get(id);
    if (!role) throw new Error("agent_role_not_found");
    if (role.reviewStatus !== "internal-approved") throw new Error("agent_role_pending_review");
    return role;
  }

  list() {
    return [...this.roles.values()];
  }
}

export function classifyControlPlaneGate(task: Pick<AgentTask, "kind" | "effects">): {
  gate: ControlPlaneGate;
  reason: string;
} {
  const effects = task.effects ?? [];
  const unknownEffect = effects.find((effect) => !KNOWN_EFFECTS.has(effect));
  if (unknownEffect) return { gate: "HUMAN", reason: "unknown_effect" };
  if (effects.some((effect) => HUMAN_EFFECTS.has(effect))) {
    return { gate: "HUMAN", reason: "high_risk_effect" };
  }
  if (AUTO_KINDS.has(task.kind)) return { gate: "AUTO", reason: "isolated_safe_scope" };
  if (AUTO_PR_KINDS.has(task.kind)) return { gate: "AUTO_PR", reason: "review_required_scope" };
  return { gate: "HUMAN", reason: "unknown_task_kind" };
}

export class InMemoryAgentLeaseStore {
  private readonly leases = new Map<string, AgentLease>();
  readonly audit: ControlPlaneAuditEvent[] = [];
  private sequence = 0;

  claim(issueKey: string, owner: string, runId: string, nowMs: number, ttlMs: number): LeaseClaim {
    if (ttlMs < 1_000) throw new Error("invalid_lease_ttl");
    const current = this.leases.get(issueKey);
    if (current && Date.parse(current.expiresAt) > nowMs) {
      return { acquired: false, lease: current, recoveredLeaseId: null };
    }

    const recoveredLeaseId = current?.id ?? null;
    const lease: AgentLease = {
      id: `lease-${++this.sequence}`,
      issueKey,
      owner,
      runId,
      acquiredAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs + ttlMs).toISOString(),
    };
    this.leases.set(issueKey, lease);
    this.audit.push({
      type: recoveredLeaseId ? "lease_recovered" : "lease_acquired",
      issueKey,
      runId,
      at: lease.acquiredAt,
      details: { leaseId: lease.id, recoveredLeaseId },
    });
    return { acquired: true, lease, recoveredLeaseId };
  }

  release(issueKey: string, leaseId: string, nowMs: number) {
    const current = this.leases.get(issueKey);
    if (!current || current.id !== leaseId) return false;
    this.leases.delete(issueKey);
    this.audit.push({
      type: "lease_released",
      issueKey,
      runId: current.runId,
      at: new Date(nowMs).toISOString(),
      details: { leaseId },
    });
    return true;
  }
}

type FoundationOptions = {
  enabled?: boolean;
  killSwitch?: boolean;
  dryRun?: boolean;
  leaseTtlMs?: number;
  now?: () => number;
};

export class GuardedControlPlane {
  readonly audit: ControlPlaneAuditEvent[] = [];
  private readonly runsByIdempotency = new Map<string, AgentRun>();
  private readonly attempts = new Map<string, number>();
  private runSequence = 0;
  private readonly roles: AgentRoleRegistry;
  private readonly leases: InMemoryAgentLeaseStore;
  private readonly modelRouter: ModelRouter;
  private readonly memory: AgentMemory;
  private readonly executor: AgentExecutor;
  private readonly options: FoundationOptions;

  constructor(
    roles: AgentRoleRegistry,
    leases: InMemoryAgentLeaseStore,
    modelRouter: ModelRouter,
    memory: AgentMemory,
    executor: AgentExecutor,
    options: FoundationOptions = {},
  ) {
    this.roles = roles;
    this.leases = leases;
    this.modelRouter = modelRouter;
    this.memory = memory;
    this.executor = executor;
    this.options = options;
  }

  async run(task: AgentTask): Promise<AgentRun> {
    const duplicate = this.runsByIdempotency.get(task.idempotencyKey);
    if (duplicate) return { ...duplicate, deduplicated: true };

    const startedAtMs = (this.options.now ?? Date.now)();
    const runId = `agent-run-${++this.runSequence}`;
    const gate = classifyControlPlaneGate(task);
    const attempt = (this.attempts.get(task.issueKey) ?? 0) + 1;
    this.attempts.set(task.issueKey, attempt);

    const block = (reason: string): AgentRun => {
      const run = this.finish({
        runId,
        task,
        gate: gate.gate,
        attempt,
        startedAtMs,
        status: "blocked",
        blocker: reason,
        modelRoute: null,
      });
      this.runsByIdempotency.set(task.idempotencyKey, run);
      return run;
    };

    if (this.options.enabled === false) return block("control_plane_disabled");
    if (this.options.killSwitch !== false) return block("kill_switch_active");
    if (this.options.dryRun === false) return block("dry_run_required");
    if (gate.gate === "HUMAN") return block(gate.reason);

    let role: AgentRole;
    try {
      role = this.roles.select(task.roleId);
    } catch (error) {
      return block(error instanceof Error ? error.message : "invalid_agent_role");
    }

    const claim = this.leases.claim(
      task.issueKey,
      this.executor.id,
      runId,
      startedAtMs,
      this.options.leaseTtlMs ?? 60_000,
    );
    if (!claim.acquired || !claim.lease) return block("lease_occupied");

    let selectedModelRoute: AgentRun["modelRoute"] = null;
    try {
      const availability = await this.executor.availability(task);
      if (availability !== "available") return block(`executor_${availability}`);

      const [modelRoute, context] = await Promise.all([
        this.modelRouter.route(task, role),
        this.memory.loadContext(task),
      ]);
      selectedModelRoute = modelRoute;
      const result = await this.executor.execute({
        task,
        role,
        modelRoute,
        context,
        dryRun: true,
      });
      if ((result.externalEffects?.length ?? 0) > 0) {
        throw new Error("executor_side_effect_contract_violation");
      }
      const sanitized = sanitizePayload({ handoff: result.handoff ?? "" }) as {
        handoff?: string;
      };
      const run = this.finish({
        runId,
        task,
        gate: gate.gate,
        attempt,
        startedAtMs,
        status: result.status === "completed" ? "completed" : "failed_recoverable",
        blocker: result.status === "failed" ? result.errorCode ?? "executor_failed" : undefined,
        modelRoute,
        handoff: sanitized.handoff,
        costMicrounits: result.costMicrounits,
        executorDurationMs: result.durationMs,
        executorId: result.executorId,
      });
      this.runsByIdempotency.set(task.idempotencyKey, run);
      return run;
    } catch (error) {
      const run = this.finish({
        runId,
        task,
        gate: gate.gate,
        attempt,
        startedAtMs,
        status: "failed_recoverable",
        blocker: error instanceof Error ? error.message : "executor_failed",
        modelRoute: selectedModelRoute,
      });
      this.runsByIdempotency.set(task.idempotencyKey, run);
      return run;
    } finally {
      this.leases.release(task.issueKey, claim.lease.id, (this.options.now ?? Date.now)());
    }
  }

  private finish(input: {
    runId: string;
    task: AgentTask;
    gate: ControlPlaneGate;
    attempt: number;
    startedAtMs: number;
    status: AgentRun["status"];
    blocker?: string;
    modelRoute: AgentRun["modelRoute"];
    handoff?: string;
    costMicrounits?: number;
    executorDurationMs?: number;
    executorId?: string;
  }): AgentRun {
    const completedAtMs = (this.options.now ?? Date.now)();
    const run: AgentRun = {
      id: input.runId,
      issueKey: input.task.issueKey,
      idempotencyKey: input.task.idempotencyKey,
      roleId: input.task.roleId,
      executorId: input.executorId ?? this.executor.id,
      modelRoute: input.modelRoute,
      gate: input.gate,
      status: input.status,
      attempt: input.attempt,
      dryRun: true,
      startedAt: new Date(input.startedAtMs).toISOString(),
      completedAt: new Date(completedAtMs).toISOString(),
      executorDurationMs: input.executorDurationMs,
      costMicrounits: input.costMicrounits,
      handoff: input.handoff,
      blocker: input.blocker,
      deduplicated: false,
      externalEffects: [],
    };
    this.audit.push({
      type: `run_${run.status}`,
      issueKey: run.issueKey,
      runId: run.id,
      at: run.completedAt,
      details: sanitizePayload({
        gate: run.gate,
        executorId: run.executorId,
        model: run.modelRoute?.model,
        executorDurationMs: run.executorDurationMs,
        blocker: run.blocker,
        handoff: run.handoff,
      }) as Record<string, unknown>,
    });
    return Object.freeze(run);
  }
}
