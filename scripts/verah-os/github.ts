import { spawnSync } from "node:child_process";

import type { VerahIssue, VerahPullRequest } from "./types.ts";

type RawIssue = Omit<VerahIssue, "labels"> & {
  labels: Array<{ name: string }>;
};

export type GitHubOperations = {
  listOpenIssues(repository: string): Promise<VerahIssue[]>;
  listOpenPullRequests(repository: string): Promise<VerahPullRequest[]>;
  mainSha(repository: string): Promise<string>;
  currentLogin(): Promise<string>;
  markInProgress(repository: string, issueNumber: number, comment: string): Promise<void>;
};

function gh(arguments_: string[]) {
  const result = spawnSync("gh", arguments_, {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    env: process.env,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.error) throw new Error(`github_cli_unavailable:${result.error.message}`);
  if (result.status !== 0) throw new Error(`github_cli_failed:${result.status}`);
  return result.stdout.trim();
}

export const githubOperations: GitHubOperations = {
  async listOpenIssues(repository) {
    const output = gh([
      "issue",
      "list",
      "--repo",
      repository,
      "--state",
      "open",
      "--limit",
      "100",
      "--json",
      "number,title,body,url,state,createdAt,updatedAt,labels",
    ]);
    const issues = JSON.parse(output || "[]") as RawIssue[];
    return issues.map((issue) => ({
      ...issue,
      labels: issue.labels.map((label) => label.name),
    }));
  },

  async listOpenPullRequests(repository) {
    const output = gh([
      "pr", "list", "--repo", repository, "--state", "open", "--limit", "100",
      "--json", "number,title,url,state,isDraft,headRefName,headRefOid,updatedAt,labels",
    ]);
    const pullRequests = JSON.parse(output || "[]") as Array<
      Omit<VerahPullRequest, "labels"> & { labels: Array<{ name: string }> }
    >;
    return pullRequests.map((pullRequest) => ({
      ...pullRequest,
      labels: pullRequest.labels.map((label) => label.name),
    }));
  },

  async mainSha(repository) {
    return gh([
      "api",
      `repos/${repository}/git/ref/heads/main`,
      "--jq",
      ".object.sha",
    ]);
  },

  async currentLogin() {
    return gh(["api", "user", "--jq", ".login"]).toLowerCase();
  },

  async markInProgress(repository, issueNumber, comment) {
    gh([
      "issue",
      "edit",
      String(issueNumber),
      "--repo",
      repository,
      "--add-label",
      "codex:in-progress",
    ]);
    gh([
      "issue",
      "comment",
      String(issueNumber),
      "--repo",
      repository,
      "--body",
      comment,
    ]);
  },
};
