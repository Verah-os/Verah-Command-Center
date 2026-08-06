import { randomUUID } from "node:crypto";
import { copyFile, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { RunCheckpoint } from "./types.ts";

const checkpointName = "checkpoint.json";
const checkpointBackupName = "checkpoint.previous.json";
const hostLockName = "host.lock";
const stopName = "STOP";

type LegacyCheckpointV3 = Omit<RunCheckpoint, "version" | "leaseExpiresAt" | "pauseReason" | "nextAttemptAt" | "workspace"> & {
  version: 3;
};

type LegacyCheckpointV2 = Omit<LegacyCheckpointV3, "version" | "recoveryAttempts" | "lastKnownHeadSha" | "lastKnownRemoteHeadSha" | "lastKnownPullRequestNumber"> & {
  version: 2;
};

function normalizeCheckpoint(value: RunCheckpoint | LegacyCheckpointV3 | LegacyCheckpointV2) {
  if (value.version === 4) return value;
  const version3: LegacyCheckpointV3 = value.version === 3 ? value : {
    ...value,
    version: 3,
    recoveryAttempts: 0,
    lastKnownHeadSha: null,
    lastKnownRemoteHeadSha: null,
    lastKnownPullRequestNumber: value.pullRequestNumber,
  };
  return {
    ...version3,
    version: 4 as const,
    leaseExpiresAt: null,
    pauseReason: null,
    nextAttemptAt: null,
    workspace: null,
  };
}

async function readCheckpointFile(path: string) {
  const value = JSON.parse(await readFile(path, "utf8")) as RunCheckpoint | LegacyCheckpointV3 | LegacyCheckpointV2;
  return normalizeCheckpoint(value);
}

export async function readCheckpoint(runtimeDirectory: string) {
  try {
    return await readCheckpointFile(join(runtimeDirectory, checkpointName));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    try {
      return await readCheckpointFile(join(runtimeDirectory, checkpointBackupName));
    } catch {
      throw new Error("checkpoint_unreadable");
    }
  }
}

export async function writeCheckpoint(
  runtimeDirectory: string,
  checkpoint: RunCheckpoint,
) {
  await mkdir(runtimeDirectory, { recursive: true });
  try {
    await copyFile(
      join(runtimeDirectory, checkpointName),
      join(runtimeDirectory, checkpointBackupName),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const temporary = join(runtimeDirectory, `${checkpointName}.${randomUUID()}.tmp`);
  await writeFile(temporary, `${JSON.stringify(checkpoint, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, join(runtimeDirectory, checkpointName));
}

export async function isStopped(runtimeDirectory: string) {
  try {
    await readFile(join(runtimeDirectory, stopName), "utf8");
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function stop(runtimeDirectory: string) {
  await mkdir(runtimeDirectory, { recursive: true });
  await writeFile(join(runtimeDirectory, stopName), "stopped\n", {
    encoding: "utf8",
    mode: 0o600,
  });
}

export async function resume(runtimeDirectory: string) {
  await rm(join(runtimeDirectory, stopName), { force: true });
}

type LockRecord = { runId: string; expiresAt: string };

export async function readHostLock(runtimeDirectory: string) {
  try {
    return JSON.parse(await readFile(join(runtimeDirectory, hostLockName), "utf8")) as LockRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error("host_lock_unreadable");
  }
}

export async function acquireHostLock(
  runtimeDirectory: string,
  durationMs: number,
  now = new Date(),
) {
  await mkdir(runtimeDirectory, { recursive: true });
  const path = join(runtimeDirectory, hostLockName);
  const runId = randomUUID();
  const expiresAt = new Date(now.getTime() + durationMs).toISOString();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(path, "wx", 0o600);
      await handle.writeFile(`${JSON.stringify({ runId, expiresAt })}\n`, "utf8");
      await handle.close();
      return { runId, expiresAt };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existing = JSON.parse(await readFile(path, "utf8")) as LockRecord;
      if (Date.parse(existing.expiresAt) > now.getTime()) {
        throw new Error(`host_lock_occupied:${existing.runId}`);
      }
      await rm(path, { force: true });
    }
  }
  throw new Error("host_lock_unavailable");
}

export async function releaseHostLock(runtimeDirectory: string, runId: string) {
  const path = join(runtimeDirectory, hostLockName);
  try {
    const existing = JSON.parse(await readFile(path, "utf8")) as LockRecord;
    if (existing.runId !== runId) throw new Error("host_lock_not_owned");
    await rm(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
}

export async function heartbeatHostLock(
  runtimeDirectory: string,
  runId: string,
  durationMs: number,
  now = new Date(),
) {
  const path = join(runtimeDirectory, hostLockName);
  const existing = JSON.parse(await readFile(path, "utf8")) as LockRecord;
  if (existing.runId !== runId) throw new Error("host_lock_not_owned");
  if (Date.parse(existing.expiresAt) <= now.getTime()) throw new Error("host_lock_expired");
  const renewed = { runId, expiresAt: new Date(now.getTime() + durationMs).toISOString() };
  const temporary = join(runtimeDirectory, `${hostLockName}.${randomUUID()}.tmp`);
  await writeFile(temporary, `${JSON.stringify(renewed)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, path);
  return renewed;
}

export async function clearRunState(runtimeDirectory: string, runId: string) {
  await releaseHostLock(runtimeDirectory, runId);
  await rm(join(runtimeDirectory, checkpointName), { force: true });
  await rm(join(runtimeDirectory, checkpointBackupName), { force: true });
}
