import { spawnSync } from "node:child_process";

import type { PullRequestGate } from "./dispatcher-types.ts";
import type { VerahPullRequest } from "./types.ts";

type RawCheck = {
  name?: string;
  context?: string;
  workflowName?: string;
  status?: string;
  conclusion?: string;
  state?: string;
};

export type DispatcherGitHubOperations = {
  inspectPullRequest(repository: string, pullRequest: VerahPullRequest | number): Promise<PullRequestGate>;
};

function gh(arguments_: string[]) {
  const result = spawnSync("gh", arguments_, {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    env: process.env,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.error) throw new Error("dispatcher_github_unavailable");
  if (result.status !== 0) throw new Error(`dispatcher_github_failed:${result.status}`);
  return result.stdout.trim();
}

function checkStatus(check: RawCheck): "success" | "failure" | "pending" | "skipped" {
  const value = String(check.conclusion ?? check.state ?? check.status ?? "").toUpperCase();
  if (["SUCCESS", "NEUTRAL"].includes(value)) return "success";
  if (["SKIPPED"].includes(value)) return "skipped";
  if (["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED"].includes(value)) {
    return "failure";
  }
  return "pending";
}

export function checkContext(check: RawCheck) {
  const name = check.name ?? check.context;
  return name && check.workflowName ? `${check.workflowName} / ${name}` : name;
}

export const dispatcherGitHubOperations: DispatcherGitHubOperations = {
  async inspectPullRequest(repository, pullRequest) {
    const number = typeof pullRequest === "number" ? pullRequest : pullRequest.number;
    const raw = JSON.parse(gh([
      "pr", "view", String(number), "--repo", repository, "--json",
      "state,isDraft,mergeable,mergeStateStatus,reviewDecision,headRefName,statusCheckRollup",
    ])) as {
      state: "OPEN" | "CLOSED" | "MERGED";
      isDraft: boolean;
      mergeable: PullRequestGate["mergeable"];
      mergeStateStatus: string;
      reviewDecision: PullRequestGate["reviewDecision"] | "";
      headRefName: string;
      statusCheckRollup: RawCheck[];
    };
    const comparison = raw.state === "OPEN"
      ? JSON.parse(gh([
          "api", `repos/${repository}/compare/main...${encodeURIComponent(raw.headRefName)}`,
        ])) as { behind_by?: number }
      : { behind_by: 0 };
    const [owner, name] = repository.split("/");
    const threads = JSON.parse(gh([
      "api", "graphql", "-f",
      "query=query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100){nodes{isResolved}}}}}",
      "-F", `owner=${owner}`, "-F", `name=${name}`, "-F", `number=${number}`,
    ])) as { data?: { repository?: { pullRequest?: { reviewThreads?: { nodes?: Array<{ isResolved: boolean }> } } } } };
    const checks: PullRequestGate["checks"] = {};
    for (const item of raw.statusCheckRollup ?? []) {
      const checkName = checkContext(item);
      if (checkName) checks[checkName] = checkStatus(item);
    }
    return {
      number,
      state: raw.state,
      isDraft: raw.isDraft,
      mergeable: raw.mergeable,
      mergeStateStatus: raw.mergeStateStatus,
      reviewDecision: raw.reviewDecision || null,
      behindBy: comparison.behind_by ?? 0,
      unresolvedThreads: threads.data?.repository?.pullRequest?.reviewThreads?.nodes
        ?.filter((thread) => !thread.isResolved).length ?? 0,
      checks,
    };
  },
};
