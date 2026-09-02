import type {
  ReleaseDecision,
  ReleaseSnapshot,
  SelectionResult,
  VerahIssue,
} from "./types.ts";

export const REQUIRED_CHECKS = [
  "CI / Application",
  "CI / Database authorization",
  "CI / Required",
  "Vercel",
] as const;

const requiredIssueSections = [
  /##\s+objetivo/i,
  /##\s+escopo/i,
  /##\s+(crit[eé]rios de aceite|aceite)/i,
];

const priorityLabels = new Map([
  ["priority:p0", 0],
  ["priority:critical", 0],
  ["priority:p1", 1],
  ["priority:high", 1],
  ["priority:p2", 2],
  ["priority:medium", 2],
  ["priority:p3", 3],
  ["priority:low", 3],
]);

function priorityOf(issue: VerahIssue) {
  return issue.labels.reduce(
    (best, label) => Math.min(best, priorityLabels.get(label.toLowerCase()) ?? 4),
    4,
  );
}

export function isExecutableIssue(issue: VerahIssue) {
  const labels = new Set(issue.labels.map((label) => label.toLowerCase()));
  return (
    issue.state === "OPEN" &&
    labels.has("codex:authorized") &&
    labels.has("codex:ready") &&
    !labels.has("codex:blocked") &&
    !labels.has("codex:in-progress") &&
    requiredIssueSections.every((section) => section.test(issue.body))
  );
}

export function selectNextIssue(issues: readonly VerahIssue[]): SelectionResult {
  const locks = issues
    .filter(
      (issue) =>
        issue.state === "OPEN" &&
        issue.labels.some((label) => label.toLowerCase() === "codex:in-progress"),
    )
    .sort((left, right) => left.number - right.number);
  if (locks.length > 0) return { status: "locked", issue: locks[0] };

  const candidates = selectExecutableIssues(issues);
  return candidates[0]
    ? { status: "selected", issue: candidates[0] }
    : { status: "empty" };
}

// The full eligible set in selection order; the Control Plane runtime (#170)
// consumes this existing contract instead of redefining eligibility.
export function selectExecutableIssues(
  issues: readonly VerahIssue[],
): VerahIssue[] {
  return issues.filter(isExecutableIssue).sort((left, right) => {
    const priority = priorityOf(left) - priorityOf(right);
    if (priority !== 0) return priority;
    const created = Date.parse(left.createdAt) - Date.parse(right.createdAt);
    return created !== 0 ? created : left.number - right.number;
  });
}

export function evaluateReleaseGates(snapshot: ReleaseSnapshot): ReleaseDecision {
  const blockers: string[] = [];
  if (snapshot.state !== "OPEN") blockers.push("pr_not_open");
  if (snapshot.isDraft) blockers.push("pr_is_draft");
  if (snapshot.mergeable !== "MERGEABLE") blockers.push("pr_not_mergeable");
  if (snapshot.mergeStateStatus !== "CLEAN") blockers.push("merge_status_not_clean");
  if (snapshot.behindBy !== 0) blockers.push("branch_behind_main");
  if (snapshot.unresolvedThreads !== 0) blockers.push("unresolved_threads");
  if (snapshot.sensitiveDiffFindings !== 0) blockers.push("sensitive_diff_findings");
  for (const check of REQUIRED_CHECKS) {
    if (snapshot.checks[check] !== "success") blockers.push(`check_not_success:${check}`);
  }
  return { allowed: blockers.length === 0, blockers };
}

export function assertSafeRepository(repository: string) {
  if (repository !== "Verah-os/Verah-Command-Center") {
    throw new Error("repository_not_allowed");
  }
}

export function branchName(issue: Pick<VerahIssue, "number" | "title">) {
  const slug = issue.title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `feat/${issue.number}-${slug || "delivery"}`;
}
