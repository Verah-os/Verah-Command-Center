import type {
  AgentRole,
  AgentTask,
  ExecutorAvailability,
  ModelRoute,
  ModelRouter,
} from "./types.ts";

export const OMNIROUTE_PHASE_0_EVIDENCE: OmniRouteEvidence = Object.freeze({
  decision: "TRIAL",
  snapshot: "63e4afa3217abaacd29f85c6701064671925764b",
  evidenceRef: "pocs/omniroute/out/omniroute-evaluation.json",
  passed: 15,
  total: 27,
  canonicalFallbackPassed: false,
  deploymentOverheadMeasured: false,
});

export type OmniRouteDecision = "ADOPT" | "TRIAL" | "HOLD" | "REJECT";

export type OmniRouteEvidence = {
  decision: OmniRouteDecision;
  snapshot: string;
  evidenceRef: string;
  passed: number;
  total: number;
  canonicalFallbackPassed: boolean;
  deploymentOverheadMeasured: boolean;
};

export type OmniRouteGate = {
  enabled: boolean;
  reason:
    | "approved"
    | "decision_not_adopted"
    | "snapshot_not_pinned"
    | "matrix_not_green"
    | "canonical_fallback_failed"
    | "deployment_overhead_missing";
  evidenceRef: string;
};

export type ModelCandidate = {
  provider: string;
  model: string;
  priority: number;
  estimatedCostMicrounits: number;
  roleIds?: readonly string[];
  taskKinds?: readonly string[];
  availability?: () => Promise<ExecutorAvailability>;
};

export type CostAwareModelRouterOptions = {
  omniRoute?: ModelRouter;
  omniRouteEvidence?: OmniRouteEvidence;
};

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function validateCandidates(candidates: readonly ModelCandidate[]): void {
  if (candidates.length === 0) {
    throw new Error("model_candidates_required");
  }

  const identities = new Set<string>();
  for (const candidate of candidates) {
    const identity = `${candidate.provider}/${candidate.model}`;
    if (!candidate.provider.trim() || !candidate.model.trim()) {
      throw new Error("model_candidate_identity_invalid");
    }
    if (identities.has(identity)) {
      throw new Error("model_candidate_duplicate");
    }
    if (
      !isNonNegativeInteger(candidate.priority) ||
      !isNonNegativeInteger(candidate.estimatedCostMicrounits)
    ) {
      throw new Error("model_candidate_cost_invalid");
    }
    identities.add(identity);
  }
}

export function assessOmniRouteEvidence(evidence: OmniRouteEvidence): OmniRouteGate {
  const base = { evidenceRef: evidence.evidenceRef };
  if (evidence.decision !== "ADOPT") {
    return { ...base, enabled: false, reason: "decision_not_adopted" };
  }
  if (!/^[a-f0-9]{40}$/i.test(evidence.snapshot)) {
    return { ...base, enabled: false, reason: "snapshot_not_pinned" };
  }
  if (
    !Number.isSafeInteger(evidence.passed) ||
    !Number.isSafeInteger(evidence.total) ||
    evidence.passed < 0 ||
    evidence.total <= 0 ||
    evidence.passed > evidence.total ||
    evidence.passed !== evidence.total
  ) {
    return { ...base, enabled: false, reason: "matrix_not_green" };
  }
  if (!evidence.canonicalFallbackPassed) {
    return { ...base, enabled: false, reason: "canonical_fallback_failed" };
  }
  if (!evidence.deploymentOverheadMeasured) {
    return { ...base, enabled: false, reason: "deployment_overhead_missing" };
  }
  return { ...base, enabled: true, reason: "approved" };
}

function isEligible(candidate: ModelCandidate, task: AgentTask, role: AgentRole): boolean {
  return (
    (!candidate.roleIds || candidate.roleIds.includes(role.id)) &&
    (!candidate.taskKinds || candidate.taskKinds.includes(task.kind))
  );
}

function isValidExternalRoute(route: ModelRoute): boolean {
  return (
    route.source === "omniroute" &&
    Boolean(route.provider.trim()) &&
    Boolean(route.model.trim()) &&
    Boolean(route.rationale.trim())
  );
}

export class CostAwareModelRouter implements ModelRouter {
  readonly #candidates: readonly ModelCandidate[];
  readonly #omniRoute?: ModelRouter;
  readonly #gate: OmniRouteGate;

  constructor(candidates: readonly ModelCandidate[], options: CostAwareModelRouterOptions = {}) {
    validateCandidates(candidates);
    this.#candidates = [...candidates].sort(
      (left, right) =>
        left.estimatedCostMicrounits - right.estimatedCostMicrounits ||
        left.priority - right.priority ||
        left.provider.localeCompare(right.provider) ||
        left.model.localeCompare(right.model),
    );
    this.#omniRoute = options.omniRoute;
    this.#gate = assessOmniRouteEvidence(
      options.omniRouteEvidence ?? OMNIROUTE_PHASE_0_EVIDENCE,
    );
  }

  omniRouteGate(): OmniRouteGate {
    return { ...this.#gate };
  }

  async route(task: AgentTask, role: AgentRole): Promise<ModelRoute> {
    if (this.#omniRoute && this.#gate.enabled) {
      try {
        const externalRoute = await this.#omniRoute.route(task, role);
        if (isValidExternalRoute(externalRoute)) {
          return externalRoute;
        }
      } catch {
        // Fail over without copying provider errors or secrets into audit rationale.
      }
    }

    const eligible = this.#candidates.filter((candidate) => isEligible(candidate, task, role));
    let fallbackCount = 0;
    for (const candidate of eligible) {
      let availability: ExecutorAvailability = "unavailable";
      try {
        availability = candidate.availability ? await candidate.availability() : "available";
      } catch {
        availability = "unavailable";
      }
      if (availability === "available") {
        return {
          provider: candidate.provider,
          model: candidate.model,
          source: "internal",
          rationale: `lowest_cost_available;fallbacks=${fallbackCount}`,
          estimatedCostMicrounits: candidate.estimatedCostMicrounits,
          fallbackCount,
        };
      }
      fallbackCount += 1;
    }

    throw new Error(eligible.length === 0 ? "model_route_not_eligible" : "model_route_unavailable");
  }
}
