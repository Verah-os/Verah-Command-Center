import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { appendAuditEvent } from "./audit.ts";
import { readVerahOsConfig } from "./config.ts";
import { readDispatcherConfig } from "./dispatcher-config.ts";
import { dispatcherStatus, runDispatcherLoop, runDispatcherOnce } from "./dispatcher.ts";
import {
  clearDispatcherStop,
  forceClearDeadDispatcherMutex,
  freshDispatcherState,
  readDispatcherState,
  requestDispatcherStop,
  writeDispatcherState,
} from "./dispatcher-state.ts";

function processAlive(pid: number | null) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function start() {
  const core = readVerahOsConfig(process.env);
  const config = await readDispatcherConfig(core);
  if (!config.enabled) throw new Error("dispatcher_disabled");
  if (!core.enabled) throw new Error("verah_os_unattended_disabled");
  if (core.killSwitch) throw new Error("verah_os_kill_switch_active");
  const current = await readDispatcherState(config.runtimeDirectory);
  if (current?.pid && processAlive(current.pid)) {
    const stale = !current.heartbeatAt ||
      Date.now() - Date.parse(current.heartbeatAt) > config.watchdogTimeoutMs;
    if (!stale) return { status: "already_running", pid: current.pid };
    throw new Error("dispatcher_watchdog_stale_process_requires_operator_stop");
  }
  await forceClearDeadDispatcherMutex(config.runtimeDirectory);
  await clearDispatcherStop(config.runtimeDirectory);
  const child = spawn(process.execPath, [
    "--experimental-strip-types",
    fileURLToPath(import.meta.url),
    "run",
  ], {
    cwd: config.workspaceDirectory,
    detached: true,
    env: process.env,
    shell: false,
    windowsHide: true,
    stdio: "ignore",
  });
  child.unref();
  const now = new Date().toISOString();
  const state = current ?? freshDispatcherState();
  await writeDispatcherState(config.runtimeDirectory, {
    ...state,
    status: "running",
    pid: child.pid ?? null,
    heartbeatAt: now,
    pauseReason: null,
    lastOutcome: "dispatcher_started",
    updatedAt: now,
  });
  await appendAuditEvent(config.runtimeDirectory, { event: "dispatcher_started", at: now, state: "running" });
  return { status: "started", pid: child.pid ?? null, dryRun: config.dryRun };
}

async function main() {
  const command = process.argv[2];
  const core = readVerahOsConfig(process.env);
  const config = await readDispatcherConfig(core);
  if (command === "start") return console.log(JSON.stringify(await start(), null, 2));
  if (command === "stop") {
    await requestDispatcherStop(config.runtimeDirectory);
    const state = (await readDispatcherState(config.runtimeDirectory)) ?? freshDispatcherState();
    await writeDispatcherState(config.runtimeDirectory, {
      ...state,
      status: "stopping",
      lastOutcome: "stop_requested",
      updatedAt: new Date().toISOString(),
    });
    return console.log(JSON.stringify({ status: "stop_requested", productionMutations: [] }, null, 2));
  }
  if (command === "status") {
    return console.log(JSON.stringify(await dispatcherStatus(config), null, 2));
  }
  if (command === "once") {
    return console.log(JSON.stringify(await runDispatcherOnce(core, config), null, 2));
  }
  if (command === "run") {
    await runDispatcherLoop(core, config);
    return;
  }
  throw new Error("usage: start|stop|status|once|run");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown_error";
  console.error(JSON.stringify({ status: "blocked", error: message }));
  process.exitCode = 1;
});
