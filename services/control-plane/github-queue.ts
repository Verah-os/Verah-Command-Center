import { selectExecutableIssues, selectNextIssue } from "../../scripts/verah-os/policy.ts";
import type { VerahIssue } from "../../scripts/verah-os/types.ts";
import { sanitizeText } from "./sanitization.ts";
import type { GitHubQueueEvent } from "./unattended-queue.ts";

// Non-production runtime configuration for the Control Plane (#170). The
// reader is fail-closed: production, a missing flag/token, an active kill
// switch or an invalid repository all disable the runtime before any network
// call happens. The token is never copied into logs, reasons or reports.
export type ControlPlaneRuntimeConfig =
  | { enabled: false; reason: string }
  | {
      enabled: true;
      reason: "configured";
      repository: string;
      githubToken: string;
      githubApiBaseUrl: string;
      branchPrefix: string;
      maxCycles: number;
      pollIntervalMs: number;
      maxQueueSteps: number;
      maxAttempts: number;
      leaseTtlMs: number;
    };

export const CONTROL_PLANE_RUNTIME_DEFAULT_REPOSITORY =
  "Verah-os/Verah-Command-Center";
export const CONTROL_PLANE_RUNTIME_DEFAULT_BRANCH_PREFIX =
  "control-plane/issue-";
const GITHUB_API_BASE_URL = "https://api.github.com";

const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const BRANCH_PREFIX_PATTERN = /^[A-Za-z0-9][A-Za-z0-9/_-]{0,60}$/;

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}

export function readControlPlaneRuntimeConfig(
  source: Record<string, string | undefined>,
): ControlPlaneRuntimeConfig {
  if (source.NODE_ENV === "production") {
    return { enabled: false, reason: "production_environment" };
  }
  if (source.CONTROL_PLANE_RUNTIME_ENABLED !== "true") {
    return { enabled: false, reason: "flag_disabled" };
  }
  // Same kill switch contract as the dry-run intake: active unless explicitly
  // released with the exact value "false".
  if (source.CONTROL_PLANE_KILL_SWITCH !== "false") {
    return { enabled: false, reason: "kill_switch_active" };
  }
  const githubToken = (source.GITHUB_TOKEN ?? source.GH_TOKEN ?? "").trim();
  if (!githubToken) return { enabled: false, reason: "github_token_missing" };
  const repository = (
    source.CONTROL_PLANE_REPOSITORY ?? CONTROL_PLANE_RUNTIME_DEFAULT_REPOSITORY
  ).trim();
  if (!REPOSITORY_PATTERN.test(repository)) {
    return { enabled: false, reason: "repository_invalid" };
  }
  const branchPrefix = (
    source.CONTROL_PLANE_RUNTIME_BRANCH_PREFIX ??
    CONTROL_PLANE_RUNTIME_DEFAULT_BRANCH_PREFIX
  ).trim();
  if (
    !BRANCH_PREFIX_PATTERN.test(branchPrefix) ||
    branchPrefix.includes("..") ||
    branchPrefix.endsWith("/") ||
    branchPrefix.endsWith(".")
  ) {
    return { enabled: false, reason: "branch_prefix_invalid" };
  }
  return {
    enabled: true,
    reason: "configured",
    repository,
    githubToken,
    githubApiBaseUrl: GITHUB_API_BASE_URL,
    branchPrefix,
    maxCycles: boundedInteger(source.CONTROL_PLANE_RUNTIME_MAX_CYCLES, 1, 1, 100),
    pollIntervalMs: boundedInteger(
      source.CONTROL_PLANE_RUNTIME_POLL_INTERVAL_MS,
      60_000,
      1_000,
      3_600_000,
    ),
    maxQueueSteps: boundedInteger(
      source.CONTROL_PLANE_RUNTIME_MAX_QUEUE_STEPS,
      10,
      1,
      100,
    ),
    maxAttempts: boundedInteger(source.CONTROL_PLANE_RUNTIME_MAX_ATTEMPTS, 2, 1, 10),
    leaseTtlMs: boundedInteger(
      source.CONTROL_PLANE_RUNTIME_LEASE_TTL_MS,
      60_000,
      1_000,
      3_600_000,
    ),
  };
}

export type GitHubQueueResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

export type GitHubQueueFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    signal: AbortSignal;
  },
) => Promise<GitHubQueueResponse>;

const defaultFetch: GitHubQueueFetch = (url, init) =>
  fetch(url, init) as Promise<GitHubQueueResponse>;

type RawGitHubIssue = {
  number?: unknown;
  title?: unknown;
  body?: unknown;
  html_url?: unknown;
  state?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  pull_request?: unknown;
  labels?: unknown;
};

function readLabelNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((label) => {
      if (typeof label === "string") return label;
      if (label && typeof label === "object") {
        const name = (label as Record<string, unknown>).name;
        return typeof name === "string" ? name : "";
      }
      return "";
    })
    .filter(Boolean)
    .slice(0, 50);
}

function toVerahIssue(raw: RawGitHubIssue): VerahIssue | null {
  if (raw.pull_request) return null; // the issues API also lists PRs
  if (
    !Number.isSafeInteger(raw.number) ||
    Number(raw.number) <= 0 ||
    typeof raw.title !== "string" ||
    typeof raw.state !== "string" ||
    typeof raw.created_at !== "string" ||
    typeof raw.updated_at !== "string"
  ) {
    return null;
  }
  return {
    number: Number(raw.number),
    title: raw.title,
    body: typeof raw.body === "string" ? raw.body : "",
    url: typeof raw.html_url === "string" ? raw.html_url : "",
    state: raw.state.toUpperCase() === "CLOSED" ? "CLOSED" : "OPEN",
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    labels: readLabelNames(raw.labels),
  };
}

// Reads the GitHub operational queue. Eligibility, priority ordering and the
// repository-wide delivery lock are the existing contract from
// scripts/verah-os/policy.ts — the Control Plane consumes it instead of
// inventing a second source of truth. The dispatcher itself is never invoked.
export async function fetchOperationalQueue(
  config: Extract<ControlPlaneRuntimeConfig, { enabled: true }>,
  options: { fetchFn?: GitHubQueueFetch; signal?: AbortSignal } = {},
): Promise<
  | { status: "ready"; candidates: VerahIssue[] }
  | { status: "locked"; issue: VerahIssue }
> {
  const fetchFn = options.fetchFn ?? defaultFetch;
  const response = await fetchFn(
    `${config.githubApiBaseUrl}/repos/${config.repository}/issues?state=open&per_page=100`,
    {
      method: "GET",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${config.githubToken}`,
        "user-agent": "verah-control-plane-runtime",
      },
      signal: options.signal ?? new AbortController().signal,
    },
  );
  if (!response.ok) throw new Error(`github_queue_http_${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload)) throw new Error("github_queue_payload_invalid");
  const issues = payload
    .map((entry) => toVerahIssue(entry as RawGitHubIssue))
    .filter((issue): issue is VerahIssue => issue !== null);

  // Respect the repository-wide delivery lock before selecting anything.
  const selection = selectNextIssue(issues);
  if (selection.status === "locked") {
    return { status: "locked", issue: selection.issue };
  }
  return { status: "ready", candidates: selectExecutableIssues(issues) };
}

// Restart safety for one-issue/one-branch: if the lease branch already has an
// open PR, the issue was delegated before and must not be delegated again.
// A failed check fails closed (skip), never executes on uncertainty.
export async function openPullRequestExistsForBranch(
  config: Extract<ControlPlaneRuntimeConfig, { enabled: true }>,
  branch: string,
  options: { fetchFn?: GitHubQueueFetch; signal?: AbortSignal } = {},
): Promise<boolean> {
  const fetchFn = options.fetchFn ?? defaultFetch;
  const owner = config.repository.split("/")[0];
  const response = await fetchFn(
    `${config.githubApiBaseUrl}/repos/${config.repository}/pulls?state=open&per_page=100&head=${encodeURIComponent(`${owner}:${branch}`)}`,
    {
      method: "GET",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${config.githubToken}`,
        "user-agent": "verah-control-plane-runtime",
      },
      signal: options.signal ?? new AbortController().signal,
    },
  );
  if (!response.ok) throw new Error(`github_queue_http_${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload)) throw new Error("github_queue_payload_invalid");
  return payload.length > 0;
}

const KIND_BY_LABEL: ReadonlyArray<readonly [string, string]> = [
  ["documentation", "documentation"],
  ["frontend", "isolated_ui"],
  ["database", "migration_file"],
  ["security", "authorization"],
];

// Deterministic GitHub issue -> AgentTask mapping over the existing
// GitHubQueueEvent contract. Untrusted issue fields are sanitized; unknown
// territory falls back to the gate classifier, which is fail-closed.
export function issueToQueueEvent(
  issue: VerahIssue,
  config: Extract<ControlPlaneRuntimeConfig, { enabled: true }>,
): GitHubQueueEvent {
  const labels = new Set(issue.labels.map((label) => label.toLowerCase()));
  const kind =
    KIND_BY_LABEL.find(([label]) => labels.has(label))?.[1] ?? "isolated_code";
  const issueKey = `${config.repository}#${issue.number}`;
  return {
    source: "github",
    deliveryId: `${issueKey}@${issue.updatedAt}`,
    task: {
      issueKey,
      idempotencyKey: `control-plane:${issueKey}@${issue.updatedAt}`,
      title: sanitizeText(issue.title, 500),
      roleId: "coding",
      kind,
      branchName: `${config.branchPrefix}${issue.number}`,
      effects: ["local_files", "repository_branch", "sandbox"],
      contextRefs: ["AGENTS.md", issue.url || issueKey],
    },
  };
}
