import { branchName, REQUIRED_CHECKS, selectNextIssue } from "./policy.ts";
import {
  acquireHostLock,
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

export async function dryRunCycle(
  config: VerahOsConfig,
  github: GitHubOperations,
) {
  if (config.killSwitch || (await isStopped(config.runtimeDirectory))) {
    return report("dry-run", "stopped", {
      nextAction: "Keep the cycle stopped until an explicit local resume.",
    });
  }
  const selection = selectNextIssue(await github.listOpenIssues(config.repository));
  if (selection.status === "empty") return report("dry-run", "empty");
  if (selection.status === "locked") {
    return report("dry-run", "locked", {
      issue: selection.issue,
      nextAction: "Resume or close the existing in-progress delivery.",
    });
  }
  return report("dry-run", "selected", {
    issue: selection.issue,
    branch: branchName(selection.issue),
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
    return report("continue", "resumed", {
      issue: {
        number: existing.issueNumber,
        title: "Resumed delivery",
        url: existing.issueUrl,
      },
      baseSha: existing.baseSha,
      branch: existing.branch,
      nextAction: "Resume from the recorded checkpoint under the unattended skill.",
    });
  }

  const lock = await acquireHostLock(config.runtimeDirectory, config.maxDurationMs, now);
  try {
    const selection = selectNextIssue(await github.listOpenIssues(config.repository));
    if (selection.status === "empty") return report("continue", "empty");
    if (selection.status === "locked") {
      return report("continue", "locked", {
        issue: selection.issue,
        nextAction: "Do not overlap the existing in-progress delivery.",
      });
    }

    const baseSha = await github.mainSha(config.repository);
    const branch = branchName(selection.issue);
    const checkpoint: RunCheckpoint = {
      version: 1,
      runId: lock.runId,
      repository: config.repository,
      issueNumber: selection.issue.number,
      issueUrl: selection.issue.url,
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
    await releaseHostLock(config.runtimeDirectory, lock.runId);
  }
}

export async function statusCycle(
  config: VerahOsConfig,
  github: GitHubOperations,
) {
  const checkpoint = await readCheckpoint(config.runtimeDirectory);
  if (checkpoint) {
    return report("status", "resumed", {
      issue: {
        number: checkpoint.issueNumber,
        title: "Recorded delivery",
        url: checkpoint.issueUrl,
      },
      baseSha: checkpoint.baseSha,
      branch: checkpoint.branch,
      nextAction: `Checkpoint state: ${checkpoint.state}.`,
    });
  }
  return dryRunCycle(config, github).then((value) => ({ ...value, mode: "status" as const }));
}
