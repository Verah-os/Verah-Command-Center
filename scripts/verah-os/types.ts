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

export type VerahOsConfig = {
  enabled: boolean;
  killSwitch: boolean;
  repository: "Verah-os/Verah-Command-Center";
  maintainers: ReadonlySet<string>;
  maxDurationMs: number;
  maxCorrectionAttempts: 2;
  runtimeDirectory: string;
};

export type SelectionResult =
  | { status: "selected"; issue: VerahIssue }
  | { status: "locked"; issue: VerahIssue }
  | { status: "empty" };

export type RunCheckpoint = {
  version: 1;
  runId: string;
  repository: string;
  issueNumber: number;
  issueUrl: string;
  baseSha: string;
  branch: string;
  state: "planning" | "implementing" | "testing" | "pr_open" | "blocked";
  correctionAttempts: number;
  startedAt: string;
  updatedAt: string;
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
  baseSha: string | null;
  branch: string | null;
  requiredChecks: string[];
  correctionBudget: number;
  repositoryMutations: string[];
  productionMutations: [];
  remoteDatabaseMutations: [];
  nextAction: string;
};
