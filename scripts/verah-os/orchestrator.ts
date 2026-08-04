import { branchName, REQUIRED_CHECKS, selectNextIssue } from "./policy.ts";
import { appendAuditEvent } from "./audit.ts";
import { readOperatingContext } from "./context.ts";
import {
  acquireHostLock,
  clearRunState,
  heartbeatHostLock,
  isStopped,
  readCheckpoint,
  readHostLock,
  releaseHostLock,
  writeCheckpoint,
} from "./state.ts";
import type {
  RunCheckpoint,
  VerahOsConfig,
  VerahOsReport,
} from "./types.ts";
import type { GitHubOperations } from "./github.ts";
import { workspaceOperations, type WorkspaceOperations } from "./workspace.ts";

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
    executionStatus: "idle",
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
      executionStatus: "blocked",
      nextAction: "Keep the cycle stopped until an explicit local resume.",
    });
  }
  const checkpoint = await readCheckpoint(config.runtimeDirectory);
  if (checkpoint) {
    const [lock, contextDocuments] = await Promise.all([
      readHostLock(config.runtimeDirectory),
      readOperatingContext(config.workspaceDirectory),
    ]);
    const executionStatus = lock && Date.parse(lock.expiresAt) > Date.now()
      ? "running"
      : "interrupted";
    return report("dry-run", "resumed", {
      executionStatus,
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
      contextDocuments,
      nextAction: "Recover from the existing checkpoint; do not select duplicate work.",
    });
  }
  const { issues, activePullRequest, contextDocuments } = await inspectQueue(config, github);
  if (activePullRequest) {
    return report("dry-run", "resumed", {
      executionStatus: "recovering",
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
      executionStatus: "interrupted",
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
  workspace: WorkspaceOperations = workspaceOperations,
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
    const [pullRequests, remoteHeadSha, snapshot] = await Promise.all([
      github.listOpenPullRequests(config.repository),
      github.remoteBranchSha(config.repository, existing.branch),
      workspace.inspect(config.workspaceDirectory, existing.branch),
    ]);
    const matchingPullRequest = pullRequests.find(
      (pullRequest) => pullRequest.headRefName === existing.branch,
    ) ?? null;
    const resumed = {
      ...existing,
      runId: renewed.runId,
      workType: matchingPullRequest ? "pull_request" as const : existing.workType,
      pullRequestNumber: matchingPullRequest?.number ?? existing.pullRequestNumber,
      workTitle: matchingPullRequest?.title ?? existing.workTitle,
      workUrl: matchingPullRequest?.url ?? existing.workUrl,
      state: matchingPullRequest
        ? "pr_open" as const
        : remoteHeadSha
          ? "testing" as const
          : snapshot.selectedBranchSha
            ? "implementing" as const
            : existing.state,
      recoveryAttempts: existing.recoveryAttempts + 1,
      lastKnownHeadSha: snapshot.selectedBranchSha ?? snapshot.headSha,
      lastKnownRemoteHeadSha: matchingPullRequest?.headRefOid ?? remoteHeadSha,
      lastKnownPullRequestNumber: matchingPullRequest?.number ?? existing.lastKnownPullRequestNumber,
      updatedAt: now.toISOString(),
    };
    await writeCheckpoint(config.runtimeDirectory, resumed);
    await appendAuditEvent(config.runtimeDirectory, {
      event: "checkpoint_recovered",
      at: now.toISOString(),
      issueNumber: resumed.issueNumber,
      pullRequestNumber: resumed.pullRequestNumber,
      branch: resumed.branch,
      state: resumed.state,
    });
    return report("continue", "resumed", {
      executionStatus: "recovering",
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
        version: 3,
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
        recoveryAttempts: 0,
        lastKnownHeadSha: activePullRequest.headRefOid,
        lastKnownRemoteHeadSha: activePullRequest.headRefOid,
        lastKnownPullRequestNumber: activePullRequest.number,
        startedAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      await writeCheckpoint(config.runtimeDirectory, checkpoint);
      await appendAuditEvent(config.runtimeDirectory, {
        event: "pull_request_resumed",
        at: now.toISOString(),
        pullRequestNumber: checkpoint.pullRequestNumber,
        branch: checkpoint.branch,
        state: checkpoint.state,
      });
      keepLock = true;
      return report("continue", "resumed", {
        executionStatus: "recovering",
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
      const labels = new Set(selection.issue.labels.map((label) => label.toLowerCase()));
      if (
        !labels.has("codex:authorized") ||
        !labels.has("codex:ready") ||
        labels.has("codex:blocked")
      ) {
        return report("continue", "locked", {
          issue: selection.issue,
          executionStatus: "blocked",
          nextAction: "The interrupted issue no longer satisfies its authorization gates.",
        });
      }
      const reservation = await github.latestReservation(
        config.repository,
        selection.issue.number,
      );
      if (!reservation || reservation.maintainer !== login) {
        return report("continue", "locked", {
          issue: selection.issue,
          executionStatus: "blocked",
          nextAction: "The GitHub lock is not owned by the current maintainer.",
        });
      }
      if (Date.parse(reservation.createdAt) + config.maxDurationMs <= now.getTime()) {
        return report("continue", "locked", {
          issue: selection.issue,
          executionStatus: "blocked",
          nextAction: "The interrupted execution exceeded its duration budget.",
        });
      }
      const branch = branchName(selection.issue);
      const [snapshot, remoteHeadSha] = await Promise.all([
        workspace.inspect(config.workspaceDirectory, branch),
        github.remoteBranchSha(config.repository, branch),
      ]);
      if (!snapshot.clean) {
        return report("continue", "locked", {
          issue: selection.issue,
          branch,
          executionStatus: "blocked",
          nextAction: "The workspace has uncommitted changes; recovery failed closed.",
        });
      }
      const checkpoint: RunCheckpoint = {
        version: 3,
        runId: lock.runId,
        repository: config.repository,
        workType: "issue",
        issueNumber: selection.issue.number,
        pullRequestNumber: null,
        workTitle: selection.issue.title,
        workUrl: selection.issue.url,
        baseSha: reservation.baseSha,
        branch,
        state: remoteHeadSha ? "testing" : snapshot.selectedBranchSha ? "implementing" : "planning",
        correctionAttempts: 0,
        recoveryAttempts: 1,
        lastKnownHeadSha: snapshot.selectedBranchSha,
        lastKnownRemoteHeadSha: remoteHeadSha,
        lastKnownPullRequestNumber: null,
        startedAt: reservation.createdAt,
        updatedAt: now.toISOString(),
      };
      await writeCheckpoint(config.runtimeDirectory, checkpoint);
      await appendAuditEvent(config.runtimeDirectory, {
        event: "github_lock_reconciled",
        at: now.toISOString(),
        issueNumber: checkpoint.issueNumber,
        branch: checkpoint.branch,
        state: checkpoint.state,
      });
      keepLock = true;
      return report("continue", "resumed", {
        issue: selection.issue,
        executionStatus: "recovering",
        baseSha: checkpoint.baseSha,
        branch: checkpoint.branch,
        contextDocuments,
        nextAction: "Resume the interrupted issue from the reconciled checkpoint.",
      });
    }

    const branch = branchName(selection.issue);
    const checkpoint: RunCheckpoint = {
      version: 3,
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
      recoveryAttempts: 0,
      lastKnownHeadSha: null,
      lastKnownRemoteHeadSha: null,
      lastKnownPullRequestNumber: null,
      startedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    await github.markInProgress(
      config.repository,
      selection.issue.number,
      `VERAH OS reserved this issue for one unattended cycle at ${checkpoint.startedAt}. Maintainer: ${login}. Base: ${baseSha}. Production and remote database operations remain prohibited.`,
    );
    await writeCheckpoint(config.runtimeDirectory, checkpoint);
    await appendAuditEvent(config.runtimeDirectory, {
      event: "issue_reserved",
      at: now.toISOString(),
      issueNumber: checkpoint.issueNumber,
      branch: checkpoint.branch,
      state: checkpoint.state,
    });
    keepLock = true;
    return report("continue", "selected", {
      executionStatus: "running",
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
  await appendAuditEvent(config.runtimeDirectory, {
    event: "heartbeat",
    at: now.toISOString(),
    issueNumber: checkpoint.issueNumber,
    pullRequestNumber: checkpoint.pullRequestNumber,
    branch: checkpoint.branch,
    state: checkpoint.state,
  });
  return { status: "heartbeat", runId: checkpoint.runId, expiresAt: lease.expiresAt };
}

export async function completeCycle(config: VerahOsConfig) {
  const checkpoint = await readCheckpoint(config.runtimeDirectory);
  if (!checkpoint) throw new Error("verah_os_checkpoint_missing");
  await appendAuditEvent(config.runtimeDirectory, {
    event: "cycle_completed",
    at: new Date().toISOString(),
    issueNumber: checkpoint.issueNumber,
    pullRequestNumber: checkpoint.pullRequestNumber,
    branch: checkpoint.branch,
    state: checkpoint.state,
  });
  await clearRunState(config.runtimeDirectory, checkpoint.runId);
  return { status: "completed", productionMutations: [], remoteDatabaseMutations: [] };
}

export async function statusCycle(
  config: VerahOsConfig,
  github: GitHubOperations,
) {
  const checkpoint = await readCheckpoint(config.runtimeDirectory);
  if (checkpoint) {
    const [lock, stopped] = await Promise.all([
      readHostLock(config.runtimeDirectory),
      isStopped(config.runtimeDirectory),
    ]);
    const executionStatus = stopped || config.killSwitch || checkpoint.state === "blocked"
      ? "blocked"
      : lock && Date.parse(lock.expiresAt) > Date.now()
        ? "running"
        : "interrupted";
    return report("status", "resumed", {
      executionStatus,
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

export async function healthCycle(
  config: VerahOsConfig,
  workspace: WorkspaceOperations = workspaceOperations,
) {
  const checkpoint = await readCheckpoint(config.runtimeDirectory);
  const [lock, stopped, snapshot] = await Promise.all([
    readHostLock(config.runtimeDirectory),
    isStopped(config.runtimeDirectory),
    workspace.inspect(config.workspaceDirectory, checkpoint?.branch ?? "main"),
  ]);
  const lease = !lock
    ? "missing"
    : Date.parse(lock.expiresAt) > Date.now()
      ? "live"
      : "expired";
  const status = stopped || config.killSwitch
    ? "blocked"
    : checkpoint && lease === "live"
      ? "running"
      : checkpoint
        ? "interrupted"
        : "idle";
  return {
    status,
    enabled: config.enabled,
    killSwitch: stopped || config.killSwitch,
    checkpoint: checkpoint ? {
      issueNumber: checkpoint.issueNumber,
      pullRequestNumber: checkpoint.pullRequestNumber,
      branch: checkpoint.branch,
      state: checkpoint.state,
      updatedAt: checkpoint.updatedAt,
      recoveryAttempts: checkpoint.recoveryAttempts,
    } : null,
    lease,
    workspace: {
      currentBranch: snapshot.currentBranch,
      clean: snapshot.clean,
      selectedBranchPresent: snapshot.selectedBranchSha !== null,
    },
    productionMutations: [],
    remoteDatabaseMutations: [],
  };
}
