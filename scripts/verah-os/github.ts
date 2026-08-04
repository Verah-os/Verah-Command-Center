import { spawnSync } from "node:child_process";

import type { ReservationRecord, VerahIssue, VerahPullRequest } from "./types.ts";

type RawIssue = Omit<VerahIssue, "labels"> & {
  labels: Array<{ name: string }>;
};

export type GitHubOperations = {
  listOpenIssues(repository: string): Promise<VerahIssue[]>;
  listOpenPullRequests(repository: string): Promise<VerahPullRequest[]>;
  mainSha(repository: string): Promise<string>;
  currentLogin(): Promise<string>;
  markInProgress(repository: string, issueNumber: number, comment: string): Promise<void>;
  latestReservation(repository: string, issueNumber: number): Promise<ReservationRecord | null>;
  remoteBranchSha(repository: string, branch: string): Promise<string | null>;
};

function ghResult(arguments_: string[]) {
  const result = spawnSync("gh", arguments_, {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    env: process.env,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.error) throw new Error(`github_cli_unavailable:${result.error.message}`);
  return result;
}

function gh(arguments_: string[]) {
  const result = ghResult(arguments_);
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

  async latestReservation(repository, issueNumber) {
    const output = gh([
      "issue", "view", String(issueNumber), "--repo", repository, "--json", "comments",
    ]);
    const value = JSON.parse(output) as {
      comments: Array<{ body: string; createdAt: string; author: { login: string } | null }>;
    };
    const prefix = "VERAH OS reserved this issue for one unattended cycle";
    const comments = value.comments
      .filter((comment) => comment.body.startsWith(prefix) && comment.author?.login)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    const latest = comments[0];
    if (!latest?.author) return null;
    const match = latest.body.match(/\bBase:\s*([a-f0-9]{40})\b/i);
    if (!match) return null;
    return {
      maintainer: latest.author.login.toLowerCase(),
      baseSha: match[1].toLowerCase(),
      createdAt: latest.createdAt,
    };
  },

  async remoteBranchSha(repository, branch) {
    const result = ghResult([
      "api",
      `repos/${repository}/branches/${encodeURIComponent(branch)}`,
      "--jq",
      ".commit.sha",
    ]);
    if (result.status === 0) return result.stdout.trim() || null;
    if (/HTTP 404|Not Found/i.test(result.stderr)) return null;
    throw new Error(`github_cli_failed:${result.status}`);
  },
};
