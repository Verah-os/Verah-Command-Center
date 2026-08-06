export type VerahIssue = {
  number: number;
  title: string;
  body: string;
  url: string;
  state: "OPEN" | "CLOSED";
  createdAt: string;
  updatedAt: string;
  labels: string[];
};

export type VerahPullRequest = {
  number: number;
  title: string;
  url: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  isDraft: boolean;
  headRefName: string;
  headRefOid: string;
  updatedAt: string;
  labels: string[];
};

export type ContextDocument = {
  path: string;
  bytes: number;
  sha256: string;
};

export type VerahOsConfig = {
  enabled: boolean;
  killSwitch: boolean;
  repository: "Verah-os/Verah-Command-Center";
  maintainers: ReadonlySet<string>;
  maxDurationMs: number;
  leaseDurationMs: number;
  maxCorrectionAttempts: 2;
  runtimeDirectory: string;
  workspaceDirectory: string;
};

export type ExecutionStatus =
  | "running"
  | "interrupted"
  | "recovering"
  | "blocked"
  | "idle";

export type SelectionResult =
  | { status: "selected"; issue: VerahIssue }
  | { status: "locked"; issue: VerahIssue }
  | { status: "empty" };

export type RunCheckpoint = {
  version: 4;
  runId: string;
  repository: string;
  workType: "issue" | "pull_request";
  issueNumber: number | null;
  pullRequestNumber: number | null;
  workTitle: string;
  workUrl: string;
  baseSha: string;
  branch: string;
  state: "planning" | "implementing" | "testing" | "pr_open" | "blocked";
  correctionAttempts: number;
  recoveryAttempts: number;
  lastKnownHeadSha: string | null;
  lastKnownRemoteHeadSha: string | null;
  lastKnownPullRequestNumber: number | null;
  leaseExpiresAt: string | null;
  pauseReason: string | null;
  nextAttemptAt: string | null;
  workspace: WorkspaceRecoverySnapshot | null;
  startedAt: string;
  updatedAt: string;
};

export type ReservationRecord = {
  maintainer: string;
  baseSha: string;
  createdAt: string;
};

export type WorkspaceSnapshot = {
  currentBranch: string | null;
  headSha: string | null;
  selectedBranchSha: string | null;
  clean: boolean;
};

export type WorkspaceRecoverySnapshot = WorkspaceSnapshot & {
  recovered: boolean;
  backupRef: string | null;
};

export type ReleaseSnapshot = {
  state: "OPEN" | "CLOSED" | "MERGED";
  isDraft: boolean;
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  mergeStateStatus: string;
  behindBy: number;
  unresolvedThreads: number;
  checks: Record<string, "success" | "failure" | "pending" | "skipped">;
  sensitiveDiffFindings: number;
};

export type ReleaseDecision = {
  allowed: boolean;
  blockers: string[];
};

export type VerahOsReport = {
  mode: "dry-run" | "continue" | "status";
  status: "selected" | "locked" | "empty" | "resumed" | "stopped";
  issue: Pick<VerahIssue, "number" | "title" | "url"> | null;
  activePullRequest: Pick<VerahPullRequest, "number" | "title" | "url" | "headRefName"> | null;
  contextDocuments: ContextDocument[];
  baseSha: string | null;
  branch: string | null;
  requiredChecks: string[];
  correctionBudget: number;
  executionStatus: ExecutionStatus;
  repositoryMutations: string[];
  productionMutations: [];
  remoteDatabaseMutations: [];
  nextAction: string;
};
