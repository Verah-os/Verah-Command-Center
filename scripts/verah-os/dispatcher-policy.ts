import { REQUIRED_CHECKS } from "./policy.ts";
import type {
  CodexInvocationResult,
  DispatcherConfig,
  DispatcherDecision,
  DispatcherState,
  PullRequestGate,
} from "./dispatcher-types.ts";

export function resetWindowIfExpired(
  state: DispatcherState,
  config: DispatcherConfig,
  now = new Date(),
) {
  if (Date.parse(state.windowStartedAt) + config.windowDurationMs > now.getTime()) return state;
  return {
    ...state,
    windowStartedAt: now.toISOString(),
    cyclesStarted: 0,
    invocations: 0,
    reportedTokens: 0,
    featureInvocations: 0,
    consecutiveFailures: 0,
    correctionInvocations: 0,
    nextAttemptAt: null,
    pauseReason: null,
  };
}

export function backoffUntil(
  state: DispatcherState,
  config: DispatcherConfig,
  now = new Date(),
) {
  const exponent = Math.max(0, Math.min(state.consecutiveFailures, 10));
  const delay = Math.min(config.maxBackoffMs, config.baseBackoffMs * 2 ** exponent);
  return new Date(now.getTime() + delay).toISOString();
}

export function classifyCodexFailure(text: string): CodexInvocationResult["status"] {
  const safe = text.slice(-16_384);
  if (/rate.?limit|too many requests|\b429\b/i.test(safe)) return "rate_limit";
  if (/quota|insufficient.?credit|credit balance|usage limit/i.test(safe)) return "quota";
  if (/authentication|not logged in|unauthori[sz]ed|invalid.?token|\b401\b/i.test(safe)) {
    return "authentication";
  }
  return "failure";
}

export function evaluatePullRequestGate(gate: PullRequestGate): DispatcherDecision {
  if (gate.state === "MERGED") return { action: "invoke", reason: "finalize_cycle" };
  if (gate.state !== "OPEN") return { action: "pause", reason: "human_review", until: null };
  if (gate.mergeable === "CONFLICTING" || gate.mergeStateStatus === "DIRTY") {
    return { action: "pause", reason: "conflict", until: null };
  }
  if (gate.behindBy > 0) return { action: "invoke", reason: "correct_pr" };
  if (gate.reviewDecision === "CHANGES_REQUESTED") return { action: "invoke", reason: "address_review" };
  if (gate.unresolvedThreads > 0) return { action: "pause", reason: "review_pending", until: null };
  if (gate.reviewDecision === "REVIEW_REQUIRED") {
    return { action: "pause", reason: "review_pending", until: null };
  }
  const required = REQUIRED_CHECKS.map((check) => gate.checks[check]);
  if (required.some((status) => status === "failure")) {
    return { action: "invoke", reason: "correct_pr" };
  }
  if (required.some((status) => status !== "success")) {
    return { action: "pause", reason: "ci_pending", until: null };
  }
  if (gate.isDraft) return { action: "invoke", reason: "release_pr" };
  return { action: "pause", reason: "human_review", until: null };
}

export function budgetDecision(
  state: DispatcherState,
  config: DispatcherConfig,
  isNewIssue: boolean,
  now = new Date(),
  alreadyReserved = false,
): Extract<DispatcherDecision, { action: "pause" }> | null {
  if (state.nextAttemptAt && Date.parse(state.nextAttemptAt) > now.getTime()) {
    return { action: "pause", reason: state.pauseReason ?? "budget", until: state.nextAttemptAt };
  }
  if (state.reportedTokens >= config.maxReportedTokensPerWindow) {
    return { action: "pause", reason: "budget", until: new Date(Date.parse(state.windowStartedAt) + config.windowDurationMs).toISOString() };
  }
  const remainingTokens = config.maxReportedTokensPerWindow - state.reportedTokens;
  if (isNewIssue && remainingTokens <= config.reserveReportedTokens) {
    return { action: "pause", reason: "budget", until: new Date(Date.parse(state.windowStartedAt) + config.windowDurationMs).toISOString() };
  }
  const remaining = config.maxInvocationsPerWindow - state.invocations;
  if (remaining <= 0 || (isNewIssue && remaining <= config.reserveInvocations)) {
    return { action: "pause", reason: "budget", until: new Date(Date.parse(state.windowStartedAt) + config.windowDurationMs).toISOString() };
  }
  if (isNewIssue && !alreadyReserved && state.cyclesStarted >= config.maxCyclesPerWindow) {
    return { action: "pause", reason: "budget", until: new Date(Date.parse(state.windowStartedAt) + config.windowDurationMs).toISOString() };
  }
  return null;
}
