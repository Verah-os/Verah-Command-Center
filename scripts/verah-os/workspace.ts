import { spawnSync } from "node:child_process";

import type { WorkspaceSnapshot } from "./types.ts";

export type WorkspaceOperations = {
  inspect(directory: string, selectedBranch: string): Promise<WorkspaceSnapshot>;
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

export const workspaceOperations: WorkspaceOperations = {
  async inspect(directory, selectedBranch) {
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
  },
};
