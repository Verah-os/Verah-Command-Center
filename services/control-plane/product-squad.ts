import { AgentRoleRegistry } from "./foundation.ts";
import { sanitizeText } from "./sanitization.ts";
import type { AgentTask } from "./types.ts";

export const PRODUCT_SQUAD_ROLES = ["research", "design", "product"] as const;
export type ProductSquadRole = (typeof PRODUCT_SQUAD_ROLES)[number];

export type SquadArtifact = {
  kind: "research_brief" | "design_spec" | "product_plan";
  summary: string;
  evidenceRefs: readonly string[];
};

export type SquadContribution = {
  roleId: ProductSquadRole;
  agentId: string;
  targetIssueKey: string;
  status: "ready" | "blocked" | "pending";
  artifacts: readonly SquadArtifact[];
  decisions: Readonly<Record<string, string>>;
  risks: readonly string[];
  externalEffects: readonly string[];
};

export type SquadPlanningContext = Readonly<{
  issueKey: string;
  objective: string;
  constraints: readonly string[];
  evidenceRefs: readonly string[];
  priorContributions: readonly SquadContribution[];
  dryRun: true;
}>;

export type ProductSquadAgent = {
  id: string;
  roleId: ProductSquadRole;
  contribute(context: SquadPlanningContext): Promise<SquadContribution>;
};

export type SquadPlanResult = {
  status: "ready" | "blocked";
  blocker: string | null;
  contributions: readonly SquadContribution[];
  contextRefs: readonly string[];
};

export type PreExecutionPlanningGate = {
  plan(task: AgentTask): Promise<SquadPlanResult>;
};

export class CrossFunctionalProductSquad implements PreExecutionPlanningGate {
  private readonly agents = new Map<ProductSquadRole, ProductSquadAgent>();

  constructor(
    agents: readonly ProductSquadAgent[],
    roles: AgentRoleRegistry = new AgentRoleRegistry(),
  ) {
    for (const agent of agents) {
      if (this.agents.has(agent.roleId)) throw new Error("duplicate_squad_role");
      roles.select(agent.roleId);
      this.agents.set(agent.roleId, agent);
    }
  }

  async plan(task: AgentTask): Promise<SquadPlanResult> {
    const base = immutableContext(task, []);
    const research = await this.contribution("research", base);
    if (!contributionReady(research)) return blocked("squad_research_blocked", [research]);

    const informed = immutableContext(task, [research]);
    const [design, product] = await Promise.all([
      this.contribution("design", informed),
      this.contribution("product", informed),
    ]);
    const contributions = [research, design, product];
    const failing = contributions.find((item) => !contributionReady(item));
    if (failing) return blocked(`squad_${failing.roleId}_blocked`, contributions);
    if (hasDecisionConflict(contributions)) return blocked("squad_conflict_unresolved", contributions);

    return {
      status: "ready",
      blocker: null,
      contributions,
      contextRefs: Object.freeze(contributions.map((item) =>
        `squad-plan:${sanitizeText(task.issueKey, 200)}:${item.roleId}`)),
    };
  }

  private async contribution(roleId: ProductSquadRole, context: SquadPlanningContext) {
    const agent = this.agents.get(roleId);
    if (!agent) return failedContribution(roleId, "missing_squad_agent", context.issueKey);
    try {
      return normalizeContribution(await agent.contribute(context), agent, context.issueKey);
    } catch {
      return failedContribution(roleId, "squad_agent_failed", context.issueKey);
    }
  }
}

export function createFixtureProductSquadAgents(): ProductSquadAgent[] {
  return [
    fixtureAgent("research", (context) => context.evidenceRefs.length === 0
      ? failedArtifact("research_brief", "Research requires canonical evidence references.")
      : [{
        kind: "research_brief",
        summary: `Evidence brief for ${context.objective}`,
        evidenceRefs: context.evidenceRefs,
      }]),
    fixtureAgent("design", (context) => [{
      kind: "design_spec",
      summary: `Isolated experience specification for ${context.objective}`,
      evidenceRefs: researchEvidence(context),
    }], { experience_scope: "isolated" }),
    fixtureAgent("product", (context) => [{
      kind: "product_plan",
      summary: `Single-delivery acceptance plan for ${context.objective}`,
      evidenceRefs: researchEvidence(context),
    }], { delivery_scope: "single_issue" }),
  ];
}

function fixtureAgent(
  roleId: ProductSquadRole,
  artifacts: (context: SquadPlanningContext) => SquadArtifact[],
  decisions: Record<string, string> = {},
): ProductSquadAgent {
  return {
    id: `fixture-${roleId}-squad-agent`,
    roleId,
    async contribute(context) {
      const contributionArtifacts = artifacts(context);
      const invalid = contributionArtifacts.some((artifact) => artifact.evidenceRefs.length === 0);
      return {
        roleId,
        agentId: `fixture-${roleId}-squad-agent`,
        targetIssueKey: context.issueKey,
        status: invalid ? "blocked" : "ready",
        artifacts: contributionArtifacts,
        decisions,
        risks: invalid ? ["canonical_evidence_missing"] : [],
        externalEffects: [],
      };
    },
  };
}

function immutableContext(
  task: AgentTask,
  priorContributions: readonly SquadContribution[],
): SquadPlanningContext {
  return deepFreeze({
    issueKey: sanitizeText(task.issueKey, 300),
    objective: sanitizeText(task.title, 500),
    constraints: (task.effects ?? []).slice(0, 50).map((value) => sanitizeText(value, 300)),
    evidenceRefs: (task.contextRefs ?? []).slice(0, 50).map((value) => sanitizeText(value, 300)),
    priorContributions: [...priorContributions],
    dryRun: true,
  });
}

function normalizeContribution(
  contribution: SquadContribution,
  agent: ProductSquadAgent,
  issueKey: string,
): SquadContribution {
  if (!contribution || contribution.roleId !== agent.roleId || contribution.targetIssueKey !== issueKey) {
    return failedContribution(agent.roleId, "invalid_squad_contribution", issueKey);
  }
  const artifacts = Array.isArray(contribution.artifacts)
    ? contribution.artifacts.slice(0, 20).map((artifact: SquadArtifact) => ({
      kind: validArtifactKind(artifact.kind) ? artifact.kind : artifactKindFor(agent.roleId),
      summary: sanitizeText(artifact.summary ?? "Invalid squad artifact.", 500),
      evidenceRefs: Object.freeze(Array.isArray(artifact.evidenceRefs)
        ? artifact.evidenceRefs.slice(0, 50).map((ref: string) => sanitizeText(ref, 300))
        : []),
    }))
    : [];
  const decisions = contribution.decisions && typeof contribution.decisions === "object"
    ? Object.fromEntries(Object.entries(contribution.decisions).slice(0, 30).map(([key, value]) => [
      sanitizeText(key, 100), sanitizeText(String(value), 300),
    ]))
    : {};
  const status = ["ready", "blocked", "pending"].includes(contribution.status)
    ? contribution.status
    : "blocked";
  return deepFreeze({
    roleId: agent.roleId,
    agentId: sanitizeText(agent.id, 100),
    targetIssueKey: issueKey,
    status,
    artifacts,
    decisions,
    risks: Array.isArray(contribution.risks)
      ? contribution.risks.slice(0, 30).map((risk) => sanitizeText(risk, 300))
      : ["invalid_risk_contract"],
    externalEffects: Array.isArray(contribution.externalEffects)
      ? contribution.externalEffects.slice(0, 10).map((effect) => sanitizeText(effect, 200))
      : ["invalid_external_effect_contract"],
  });
}

function contributionReady(contribution: SquadContribution) {
  return contribution.status === "ready"
    && contribution.externalEffects.length === 0
    && contribution.artifacts.length > 0
    && contribution.artifacts.every((artifact) =>
      artifact.kind === artifactKindFor(contribution.roleId)
      && artifact.evidenceRefs.length > 0);
}

function hasDecisionConflict(contributions: readonly SquadContribution[]) {
  const decisions = new Map<string, string>();
  for (const contribution of contributions) {
    for (const [key, value] of Object.entries(contribution.decisions)) {
      const current = decisions.get(key);
      if (current !== undefined && current !== value) return true;
      decisions.set(key, value);
    }
  }
  return false;
}

function failedContribution(
  roleId: ProductSquadRole,
  risk: string,
  issueKey: string,
): SquadContribution {
  return deepFreeze({
    roleId,
    agentId: "control-plane",
    targetIssueKey: issueKey,
    status: "blocked",
    artifacts: [],
    decisions: {},
    risks: [risk],
    externalEffects: [],
  });
}

function blocked(blocker: string, contributions: readonly SquadContribution[]): SquadPlanResult {
  return { status: "blocked", blocker, contributions, contextRefs: [] };
}

function researchEvidence(context: SquadPlanningContext) {
  return context.priorContributions
    .filter((item) => item.roleId === "research")
    .flatMap((item) => item.artifacts.flatMap((artifact) => artifact.evidenceRefs));
}

function failedArtifact(kind: SquadArtifact["kind"], summary: string): SquadArtifact[] {
  return [{ kind, summary, evidenceRefs: [] }];
}

function validArtifactKind(value: string): value is SquadArtifact["kind"] {
  return ["research_brief", "design_spec", "product_plan"].includes(value);
}

function artifactKindFor(roleId: ProductSquadRole): SquadArtifact["kind"] {
  if (roleId === "research") return "research_brief";
  if (roleId === "design") return "design_spec";
  return "product_plan";
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
