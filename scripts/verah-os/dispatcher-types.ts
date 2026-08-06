export type DispatcherPauseReason =
  | "authentication"
  | "budget"
  | "ci_failure"
  | "ci_pending"
  | "conflict"
  | "human_review"
  | "host_lock_expired"
  | "kill_switch"
  | "no_work"
  | "quota"
  | "rate_limit"
  | "review_pending"
  | "workspace_recovery"
  | "stopped";

export type DispatcherRunStatus =
  | "idle"
  | "queued"
  | "resuming"
  | "recovering"
  | "running"
  | "paused"
  | "waiting_budget"
  | "waiting_quota"
  | "waiting_rate_limit"
  | "waiting_authentication"
  | "stopping";

export type DispatcherQueueItem = {
  issueNumber: number | null;
  pullRequestNumber: number | null;
  branch: string;
  baseSha: string;
  checkpointRunId: string;
  phase: "reserved" | "active" | "pull_request";
  reservedAt: string;
  leaseExpiresAt: string | null;
  pauseReason: DispatcherPauseReason | null;
  nextAttemptAt: string | null;
  workingState: {
    currentBranch: string | null;
    headSha: string | null;
    clean: boolean;
    recovered: boolean;
    backupRef: string | null;
  } | null;
};

export type DispatcherConfig = {
  enabled: boolean;
  dryRun: boolean;
  runtimeDirectory: string;
  workspaceDirectory: string;
  pollIntervalMs: number;
  heartbeatIntervalMs: number;
  watchdogTimeoutMs: number;
  windowDurationMs: number;
  maxCyclesPerWindow: number;
  maxInvocationsPerWindow: number;
  maxInvocationDurationMs: number;
  reserveInvocations: number;
  maxReportedTokensPerWindow: number;
  reserveReportedTokens: number;
  baseBackoffMs: number;
  maxBackoffMs: number;
  codexCommand: string;
  codexArguments: string[];
};

export type DispatcherState = {
  version: 3;
  status: DispatcherRunStatus;
  pid: number | null;
  windowStartedAt: string;
  cyclesStarted: number;
  invocations: number;
  reportedTokens: number;
  featureInvocations: number;
  consecutiveFailures: number;
  correctionInvocations: number;
  activeIssueNumber: number | null;
  activePullRequestNumber: number | null;
  queue: DispatcherQueueItem | null;
  activeInvocationStartedAt: string | null;
  heartbeatAt: string | null;
  nextAttemptAt: string | null;
  pauseReason: DispatcherPauseReason | null;
  lastOutcome: string | null;
  updatedAt: string;
};

export type PullRequestGate = {
  number: number;
  state: "OPEN" | "CLOSED" | "MERGED";
  isDraft: boolean;
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  mergeStateStatus: string;
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
  behindBy: number;
  unresolvedThreads: number;
  checks: Record<string, "success" | "failure" | "pending" | "skipped">;
};

export type CodexInvocationResult = {
  status: "success" | "failure" | "rate_limit" | "quota" | "authentication" | "timeout" | "stopped";
  exitCode: number | null;
  reportedTokens: number;
};

export type DispatcherDecision =
  | { action: "invoke"; reason: "address_review" | "continue_issue" | "correct_pr" | "finalize_cycle" | "release_pr" | "start_issue" }
  | { action: "pause"; reason: DispatcherPauseReason; until: string | null };
