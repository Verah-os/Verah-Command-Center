import { branchName, REQUIRED_CHECKS, selectNextIssue } from "./policy.ts";
import { readOperatingContext } from "./context.ts";
import {
  acquireHostLock,
  clearRunState,
  heartbeatHostLock,
  isStopped,
  readCheckpoint,
  releaseHostLock,
  writeCheckpoint,
} from "./state.ts";
import type {
  RunCheckpoint,
  VerahOsConfig,
  VerahOsReport,
} from "./types.ts";
import type { GitHubOperations } from "./github.ts";

function report(
  mode: VerahOsReport["mode"],
  status: VerahOsReport["status"],
  options: Partial<VerahOsReport> = {},
): VerahOsReport {
  return {
    mode,
    status,
    issue: null,
    activePullRequest: null,
    contextDocuments: [],
    baseSha: null,
    branch: null,
    requiredChecks: [...REQUIRED_CHECKS],
    correctionBudget: 2,
    repositoryMutations: [],
    productionMutations: [],
    remoteDatabaseMutations: [],
    nextAction: "No authorized issue is ready.",
    ...options,
  };
}

async function inspectQueue(config: VerahOsConfig, github: GitHubOperations) {
  const [issues, pullRequests, contextDocuments] = await Promise.all([
    github.listOpenIssues(config.repository),
    github.listOpenPullRequests(config.repository),
    readOperatingContext(config.workspaceDirectory),
  ]);
  const activePullRequest = pullRequests
    .filter((pullRequest) => pullRequest.headRefName !== "main")
    .sort((left, right) => {
      const updated = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
      return updated !== 0 ? updated : right.number - left.number;
    })[0] ?? null;
  return { issues, activePullRequest, contextDocuments };
}

export async function dryRunCycle(
  config: VerahOsConfig,
  github: GitHubOperations,
) {
  if (config.killSwitch || (await isStopped(config.runtimeDirectory))) {
    return report("dry-run", "stopped", {
      nextAction: "Keep the cycle stopped until an explicit local resume.",
    });
  }
  const { issues, activePullRequest, contextDocuments } = await inspectQueue(config, github);
  if (activePullRequest) {
    return report("dry-run", "resumed", {
      activePullRequest,
      branch: activePullRequest.headRefName,
      contextDocuments,
      nextAction: `Review and resume PR #${activePullRequest.number}; do not create duplicate work.`,
    });
  }
  const selection = selectNextIssue(issues);
  if (selection.status === "empty") return report("dry-run", "empty", { contextDocuments });
  if (selection.status === "locked") {
    return report("dry-run", "locked", {
      issue: selection.issue,
      contextDocuments,
      nextAction: "Resume or close the existing in-progress delivery.",
    });
  }
  return report("dry-run", "selected", {
    issue: selection.issue,
    branch: branchName(selection.issue),
    contextDocuments,
    nextAction: "Invoke the unattended skill explicitly to start this issue.",
  });
}

export async function continueCycle(
  config: VerahOsConfig,
  github: GitHubOperations,
  now = new Date(),
) {
  if (!config.enabled) throw new Error("verah_os_unattended_disabled");
  if (config.killSwitch || (await isStopped(config.runtimeDirectory))) {
    throw new Error("verah_os_kill_switch_active");
  }
  const login = (await github.currentLogin()).trim().toLowerCase();
  if (config.maintainers.size === 0 || !config.maintainers.has(login)) {
    throw new Error("verah_os_maintainer_not_authorized");
  }

  const existing = await readCheckpoint(config.runtimeDirectory);
  if (existing) {
    if (Date.parse(existing.startedAt) + config.maxDurationMs <= now.getTime()) {
      throw new Error("verah_os_timeout_exceeded");
    }
    const renewed = await acquireHostLock(config.runtimeDirectory, config.leaseDurationMs, now);
    const resumed = { ...existing, runId: renewed.runId, updatedAt: now.toISOString() };
    await writeCheckpoint(config.runtimeDirectory, resumed);
    return report("continue", "resumed", {
      issue: resumed.workType === "issue" && resumed.issueNumber !== null ? {
        number: resumed.issueNumber,
        title: resumed.workTitle,
        url: resumed.workUrl,
      } : null,
      activePullRequest: resumed.workType === "pull_request" && resumed.pullRequestNumber !== null ? {
        number: resumed.pullRequestNumber,
        title: resumed.workTitle,
        url: resumed.workUrl,
        headRefName: resumed.branch,
      } : null,
      baseSha: existing.baseSha,
      branch: existing.branch,
      contextDocuments: await readOperatingContext(config.workspaceDirectory),
      nextAction: "Resume from the recorded checkpoint; keep the lease alive with verah:heartbeat.",
    });
  }

  const lock = await acquireHostLock(config.runtimeDirectory, config.leaseDurationMs, now);
  let keepLock = false;
  try {
    const { issues, activePullRequest, contextDocuments } = await inspectQueue(config, github);
    const baseSha = await github.mainSha(config.repository);
    if (activePullRequest) {
      const checkpoint: RunCheckpoint = {
        version: 2,
        runId: lock.runId,
        repository: config.repository,
        workType: "pull_request",
        issueNumber: null,
        pullRequestNumber: activePullRequest.number,
        workTitle: activePullRequest.title,
        workUrl: activePullRequest.url,
        baseSha,
        branch: activePullRequest.headRefName,
        state: "pr_open",
        correctionAttempts: 0,
        startedAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      await writeCheckpoint(config.runtimeDirectory, checkpoint);
      keepLock = true;
      return report("continue", "resumed", {
        activePullRequest,
        baseSha,
        branch: activePullRequest.headRefName,
        contextDocuments,
        nextAction: `Resume PR #${activePullRequest.number}; do not create duplicate work.`,
      });
    }
    const selection = selectNextIssue(issues);
    if (selection.status === "empty") return report("continue", "empty");
    if (selection.status === "locked") {
      return report("continue", "locked", {
        issue: selection.issue,
        nextAction: "Do not overlap the existing in-progress delivery.",
      });
    }

    const branch = branchName(selection.issue);
    const checkpoint: RunCheckpoint = {
      version: 2,
      runId: lock.runId,
      repository: config.repository,
      workType: "issue",
      issueNumber: selection.issue.number,
      pullRequestNumber: null,
      workTitle: selection.issue.title,
      workUrl: selection.issue.url,
      baseSha,
      branch,
      state: "planning",
      correctionAttempts: 0,
      startedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    await github.markInProgress(
      config.repository,
      selection.issue.number,
      `VERAH OS reserved this issue for one unattended cycle at ${checkpoint.startedAt}. Maintainer: ${login}. Base: ${baseSha}. Production and remote database operations remain prohibited.`,
    );
    await writeCheckpoint(config.runtimeDirectory, checkpoint);
    keepLock = true;
    return report("continue", "selected", {
      issue: selection.issue,
      baseSha,
      branch,
      repositoryMutations: [
        `issue:${selection.issue.number}:label:codex:in-progress`,
        `issue:${selection.issue.number}:audit-comment`,
      ],
      nextAction: "Execute the selected issue through $verah-os-unattended.",
    });
  } finally {
    if (!keepLock) await releaseHostLock(config.runtimeDirectory, lock.runId);
  }
}

export async function heartbeatCycle(config: VerahOsConfig, now = new Date()) {
  const checkpoint = await readCheckpoint(config.runtimeDirectory);
  if (!checkpoint) throw new Error("verah_os_checkpoint_missing");
  if (config.killSwitch || (await isStopped(config.runtimeDirectory))) {
    throw new Error("verah_os_kill_switch_active");
  }
  const lease = await heartbeatHostLock(
    config.runtimeDirectory,
    checkpoint.runId,
    config.leaseDurationMs,
    now,
  );
  await writeCheckpoint(config.runtimeDirectory, { ...checkpoint, updatedAt: now.toISOString() });
  return { status: "heartbeat", runId: checkpoint.runId, expiresAt: lease.expiresAt };
}

export async function completeCycle(config: VerahOsConfig) {
  const checkpoint = await readCheckpoint(config.runtimeDirectory);
  if (!checkpoint) throw new Error("verah_os_checkpoint_missing");
  await clearRunState(config.runtimeDirectory, checkpoint.runId);
  return { status: "completed", productionMutations: [], remoteDatabaseMutations: [] };
}

export async function statusCycle(
  config: VerahOsConfig,
  github: GitHubOperations,
) {
  const checkpoint = await readCheckpoint(config.runtimeDirectory);
  if (checkpoint) {
    return report("status", "resumed", {
      issue: checkpoint.workType === "issue" && checkpoint.issueNumber !== null ? {
        number: checkpoint.issueNumber,
        title: checkpoint.workTitle,
        url: checkpoint.workUrl,
      } : null,
      activePullRequest: checkpoint.workType === "pull_request" && checkpoint.pullRequestNumber !== null ? {
        number: checkpoint.pullRequestNumber,
        title: checkpoint.workTitle,
        url: checkpoint.workUrl,
        headRefName: checkpoint.branch,
      } : null,
      baseSha: checkpoint.baseSha,
      branch: checkpoint.branch,
      nextAction: `Checkpoint state: ${checkpoint.state}.`,
    });
  }
  return dryRunCycle(config, github).then((value) => ({ ...value, mode: "status" as const }));
}
