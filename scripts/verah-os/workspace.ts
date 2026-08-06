import { spawnSync } from "node:child_process";

import type { WorkspaceRecoverySnapshot, WorkspaceSnapshot } from "./types.ts";

export type WorkspaceOperations = {
  inspect(directory: string, selectedBranch: string): Promise<WorkspaceSnapshot>;
  ensureIssueBranch(
    directory: string,
    selectedBranch: string,
    baseSha: string,
  ): Promise<WorkspaceRecoverySnapshot>;
};

function git(directory: string, arguments_: string[], allowFailure = false) {
  const result = spawnSync("git", arguments_, {
    cwd: directory,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  if (result.error) throw new Error("git_unavailable");
  if (result.status !== 0) {
    if (allowFailure) return null;
    throw new Error(`git_read_failed:${arguments_[0] ?? "unknown"}`);
  }
  return result.stdout.trim();
}

function branchReference(branch: string) {
  if (!/^[a-z0-9][a-z0-9._/-]*$/i.test(branch) || branch.includes("..")) {
    throw new Error("workspace_branch_unsafe");
  }
  if (!/^[a-f0-9]{40}$/i.test(branch)) return branch;
  throw new Error("workspace_branch_unsafe");
}

function baseReference(baseSha: string) {
  if (!/^[a-f0-9]{40}$/i.test(baseSha)) throw new Error("workspace_base_sha_invalid");
  return baseSha;
}

async function inspect(directory: string, selectedBranch: string): Promise<WorkspaceSnapshot> {
  const currentBranch = git(directory, ["branch", "--show-current"], true);
  const headSha = git(directory, ["rev-parse", "HEAD"], true);
  const selectedBranchSha = git(
    directory,
    ["rev-parse", "--verify", `refs/heads/${selectedBranch}`],
    true,
  );
  const status = git(directory, ["status", "--porcelain"], true);
  return {
    currentBranch: currentBranch || null,
    headSha: headSha || null,
    selectedBranchSha: selectedBranchSha || null,
    clean: status === "",
  };
}

export const workspaceOperations: WorkspaceOperations = {
  inspect,
  async ensureIssueBranch(directory, selectedBranch, baseSha) {
    const branch = branchReference(selectedBranch);
    const base = baseReference(baseSha);
    const before = await inspect(directory, branch);
    if (before.currentBranch === branch) {
      return { ...before, recovered: false, backupRef: null };
    }

    let backupRef: string | null = null;
    try {
      if (!before.clean) {
        git(directory, [
          "stash", "push", "-u", "-m",
          `VERAH OS automatic recovery for ${branch}`,
        ]);
        backupRef = git(directory, ["rev-parse", "refs/stash"]);
      }

      const local = git(directory, ["rev-parse", "--verify", `refs/heads/${branch}`], true);
      const remote = git(directory, ["rev-parse", "--verify", `refs/remotes/origin/${branch}`], true);
      if (local) {
        git(directory, ["switch", branch]);
      } else if (remote) {
        git(directory, ["switch", "-c", branch, `refs/remotes/origin/${branch}`]);
      } else {
        git(directory, ["switch", "-c", branch, base]);
      }
      if (backupRef) git(directory, ["stash", "apply", backupRef]);

      const recovered = await inspect(directory, branch);
      if (recovered.currentBranch !== branch) throw new Error("workspace_branch_recovery_failed");
      return { ...recovered, recovered: true, backupRef };
    } catch {
      throw new Error("workspace_branch_recovery_failed");
    }
  },
};
