import { sanitizePayload, sanitizeText } from "./sanitization.ts";
import type { AgentCheckResult, AgentRun } from "./types.ts";

export const REVIEW_DISCIPLINES = ["review", "qa", "security"] as const;
export type ReviewDiscipline = (typeof REVIEW_DISCIPLINES)[number];

export type ReviewFinding = {
  code: string;
  severity: "info" | "warning" | "blocking";
  summary: string;
  evidenceRef?: string;
};

export type ReviewEvidence = Readonly<{
  targetRunId: string;
  issueKey: string;
  roleId: string;
  branchName?: string;
  gate: AgentRun["gate"];
  dryRun: true;
  handoff?: string;
  artifacts?: AgentRun["artifacts"];
  externalEffects: readonly string[];
}>;

export type ReviewAssessment = {
  discipline: ReviewDiscipline;
  assessorId: string;
  targetRunId: string;
  status: "passed" | "failed" | "pending";
  findings: readonly ReviewFinding[];
  completedAt: string;
  externalEffects: readonly string[];
};

export type IndependentReviewAgent = {
  id: string;
  discipline: ReviewDiscipline;
  assess(evidence: ReviewEvidence): Promise<ReviewAssessment>;
};

export type ReviewGateResult = {
  status: "passed" | "blocked";
  blocker: string | null;
  assessments: readonly ReviewAssessment[];
  checks: readonly AgentCheckResult[];
};

export type PostExecutionReviewGate = {
  evaluate(run: AgentRun): Promise<ReviewGateResult>;
};

export class IndependentReviewGate implements PostExecutionReviewGate {
  private readonly agents = new Map<ReviewDiscipline, IndependentReviewAgent>();
  private readonly now: () => number;

  constructor(agents: readonly IndependentReviewAgent[], now: () => number = Date.now) {
    for (const agent of agents) {
      if (this.agents.has(agent.discipline)) throw new Error("duplicate_review_discipline");
      this.agents.set(agent.discipline, agent);
    }
    this.now = now;
  }

  async evaluate(run: AgentRun): Promise<ReviewGateResult> {
    if (run.status !== "completed") return blockedResult("review_target_not_completed", []);
    const evidence = immutableEvidence(run);
    const assessments = await Promise.all(REVIEW_DISCIPLINES.map(async (discipline) => {
      const agent = this.agents.get(discipline);
      if (!agent) return failedAssessment(discipline, "missing_review_agent", run.id, this.now());
      try {
        return normalizeAssessment(await agent.assess(evidence), agent, run.id, this.now());
      } catch {
        return failedAssessment(discipline, "review_agent_failed", run.id, this.now());
      }
    }));

    const failing = assessments.find((assessment) =>
      assessment.status !== "passed"
      || assessment.externalEffects.length > 0
      || assessment.findings.some((finding) => finding.severity === "blocking"));
    if (failing) return blockedResult(`review_${failing.discipline}_blocked`, assessments);
    return {
      status: "passed",
      blocker: null,
      assessments,
      checks: assessments.map(toCheck),
    };
  }
}

export function createFixtureReviewAgents(now: () => number = Date.now): IndependentReviewAgent[] {
  return [
    policyAgent("review", (evidence) => {
      const findings: ReviewFinding[] = [];
      if (!evidence.artifacts?.draftPrUrl) findings.push(blocking("draft_pr_missing", "Draft PR evidence is required."));
      if (!evidence.handoff) findings.push(blocking("handoff_missing", "A compact handoff is required."));
      return findings;
    }, now),
    policyAgent("qa", (evidence) => {
      const checks = evidence.artifacts?.checks ?? [];
      if (!checks.some((check) => check.name === "Required")) {
        return [blocking("required_check_missing", "The Required check is missing.")];
      }
      if (checks.some((check) => check.status !== "passed")) {
        return [blocking("checks_not_passed", "Every reported check must pass.")];
      }
      return [];
    }, now),
    policyAgent("security", (evidence) => {
      if (!evidence.dryRun || evidence.externalEffects.length > 0) {
        return [blocking("unsafe_execution_evidence", "Review evidence must be dry-run with zero external effects.")];
      }
      if (evidence.gate === "HUMAN") {
        return [blocking("human_gate_required", "A HUMAN-gated run cannot be approved automatically.")];
      }
      return [];
    }, now),
  ];
}

function policyAgent(
  discipline: ReviewDiscipline,
  policy: (evidence: ReviewEvidence) => ReviewFinding[],
  now: () => number,
): IndependentReviewAgent {
  return {
    id: `fixture-${discipline}-agent`,
    discipline,
    async assess(evidence) {
      const findings = policy(evidence);
      return {
        discipline,
        assessorId: `fixture-${discipline}-agent`,
        targetRunId: evidence.targetRunId,
        status: findings.some((finding) => finding.severity === "blocking") ? "failed" : "passed",
        findings,
        completedAt: new Date(now()).toISOString(),
        externalEffects: [],
      };
    },
  };
}

function immutableEvidence(run: AgentRun): ReviewEvidence {
  const sanitized = sanitizePayload({
    targetRunId: run.id,
    issueKey: run.issueKey,
    roleId: run.roleId,
    gate: run.gate,
    dryRun: true,
    externalEffects: run.externalEffects,
    ...(run.branchName ? { branchName: run.branchName } : {}),
    ...(run.handoff ? { handoff: run.handoff } : {}),
    ...(run.artifacts ? { artifacts: run.artifacts } : {}),
  }) as ReviewEvidence;
  return deepFreeze(sanitized);
}

function normalizeAssessment(
  assessment: ReviewAssessment,
  agent: IndependentReviewAgent,
  targetRunId: string,
  nowMs: number,
): ReviewAssessment {
  if (!assessment || assessment.discipline !== agent.discipline || assessment.targetRunId !== targetRunId) {
    return failedAssessment(agent.discipline, "invalid_review_assessment", targetRunId, nowMs);
  }
  const status = ["passed", "failed", "pending"].includes(assessment.status)
    ? assessment.status
    : "failed";
  const findings = Array.isArray(assessment.findings)
    ? assessment.findings.slice(0, 50).map((finding) => ({
      code: sanitizeText(finding.code ?? "invalid_finding", 100),
      severity: ["info", "warning", "blocking"].includes(finding.severity)
        ? finding.severity
        : "blocking",
      summary: sanitizeText(finding.summary ?? "Invalid review finding.", 500),
      evidenceRef: finding.evidenceRef ? sanitizeText(finding.evidenceRef, 300) : undefined,
    } as ReviewFinding))
    : [blocking("invalid_findings", "Review findings were not structured.")];
  return Object.freeze({
    discipline: agent.discipline,
    assessorId: sanitizeText(agent.id, 100),
    targetRunId,
    status,
    findings: Object.freeze(findings),
    completedAt: validDate(assessment.completedAt) ?? new Date(nowMs).toISOString(),
    externalEffects: Object.freeze(Array.isArray(assessment.externalEffects)
      ? assessment.externalEffects.slice(0, 10).map((effect) => sanitizeText(effect, 200))
      : ["invalid_external_effects"]),
  });
}

function failedAssessment(
  discipline: ReviewDiscipline,
  code: string,
  targetRunId: string,
  nowMs: number,
): ReviewAssessment {
  return Object.freeze({
    discipline,
    assessorId: "control-plane",
    targetRunId,
    status: "failed",
    findings: Object.freeze([blocking(code, "Required independent assessment did not complete safely.")]),
    completedAt: new Date(nowMs).toISOString(),
    externalEffects: Object.freeze([]),
  });
}

function blockedResult(blocker: string, assessments: readonly ReviewAssessment[]): ReviewGateResult {
  return {
    status: "blocked",
    blocker,
    assessments,
    checks: assessments.map(toCheck),
  };
}

function toCheck(assessment: ReviewAssessment): AgentCheckResult {
  return {
    name: `Independent ${assessment.discipline}`,
    status: assessment.status === "passed"
      && assessment.externalEffects.length === 0
      && !assessment.findings.some((finding) => finding.severity === "blocking")
      ? "passed"
      : assessment.status === "pending" ? "pending" : "failed",
  };
}

function blocking(code: string, summary: string): ReviewFinding {
  return { code, severity: "blocking", summary };
}

function validDate(value: string) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
