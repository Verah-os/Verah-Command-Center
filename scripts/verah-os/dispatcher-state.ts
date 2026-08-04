import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { DispatcherState } from "./dispatcher-types.ts";

const directoryName = "dispatcher";
const stateName = "state.json";
const mutexName = "mutex.lock";
const stopName = "STOP";

export function dispatcherDirectory(runtimeDirectory: string) {
  return join(runtimeDirectory, directoryName);
}

export function freshDispatcherState(now = new Date()): DispatcherState {
  return {
    version: 1,
    status: "idle",
    pid: null,
    windowStartedAt: now.toISOString(),
    cyclesStarted: 0,
    invocations: 0,
    reportedTokens: 0,
    consecutiveFailures: 0,
    correctionInvocations: 0,
    activeIssueNumber: null,
    activePullRequestNumber: null,
    activeInvocationStartedAt: null,
    heartbeatAt: null,
    nextAttemptAt: null,
    pauseReason: null,
    lastOutcome: null,
    updatedAt: now.toISOString(),
  };
}

export async function readDispatcherState(runtimeDirectory: string) {
  try {
    const parsed = JSON.parse(
      await readFile(join(dispatcherDirectory(runtimeDirectory), stateName), "utf8"),
    ) as DispatcherState;
    if (parsed.version !== 1) throw new Error("dispatcher_state_version_unsupported");
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error("dispatcher_state_unreadable");
  }
}

export async function writeDispatcherState(runtimeDirectory: string, state: DispatcherState) {
  const directory = dispatcherDirectory(runtimeDirectory);
  await mkdir(directory, { recursive: true });
  const temporary = join(directory, `${stateName}.${randomUUID()}.tmp`);
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, join(directory, stateName));
}

export async function acquireDispatcherMutex(runtimeDirectory: string) {
  const directory = dispatcherDirectory(runtimeDirectory);
  await mkdir(directory, { recursive: true });
  const path = join(directory, mutexName);
  let handle;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      handle = await open(path, "wx", 0o600);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const current = JSON.parse(await readFile(path, "utf8")) as { pid: number };
      let alive = true;
      try {
        process.kill(current.pid, 0);
      } catch {
        alive = false;
      }
      if (alive) throw new Error("dispatcher_already_running");
      await rm(path, { force: true });
    }
  }
  if (!handle) throw new Error("dispatcher_mutex_unavailable");
  const owner = randomUUID();
  await handle.writeFile(`${JSON.stringify({ owner, pid: process.pid })}\n`, "utf8");
  await handle.close();
  return owner;
}

export async function forceClearDeadDispatcherMutex(runtimeDirectory: string) {
  const path = join(dispatcherDirectory(runtimeDirectory), mutexName);
  try {
    const current = JSON.parse(await readFile(path, "utf8")) as { pid: number };
    try {
      process.kill(current.pid, 0);
      return false;
    } catch {
      await rm(path, { force: true });
      return true;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function releaseDispatcherMutex(runtimeDirectory: string, owner: string) {
  const path = join(dispatcherDirectory(runtimeDirectory), mutexName);
  try {
    const current = JSON.parse(await readFile(path, "utf8")) as { owner: string };
    if (current.owner !== owner) throw new Error("dispatcher_mutex_not_owned");
    await rm(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
}

export async function requestDispatcherStop(runtimeDirectory: string) {
  const directory = dispatcherDirectory(runtimeDirectory);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, stopName), "stopped\n", { encoding: "utf8", mode: 0o600 });
}

export async function clearDispatcherStop(runtimeDirectory: string) {
  await rm(join(dispatcherDirectory(runtimeDirectory), stopName), { force: true });
}

export async function isDispatcherStopped(runtimeDirectory: string) {
  try {
    await readFile(join(dispatcherDirectory(runtimeDirectory), stopName), "utf8");
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
