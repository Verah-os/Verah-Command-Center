import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";

import type { DispatcherConfig } from "./dispatcher-types.ts";
import type { VerahOsConfig } from "./types.ts";

type LocalConfig = Partial<Record<
  | "enabled"
  | "dryRun"
  | "pollIntervalMs"
  | "heartbeatIntervalMs"
  | "watchdogTimeoutMs"
  | "windowDurationMs"
  | "maxCyclesPerWindow"
  | "maxInvocationsPerWindow"
  | "maxInvocationDurationMs"
  | "reserveInvocations"
  | "maxReportedTokensPerWindow"
  | "baseBackoffMs"
  | "maxBackoffMs"
  | "codexCommand",
  boolean | number | string
>> & { codexArguments?: unknown };

function bounded(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}

function bool(value: unknown, fallback: boolean) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return fallback;
}

async function readLocalConfig(runtimeDirectory: string): Promise<LocalConfig> {
  try {
    return JSON.parse(
      await readFile(join(runtimeDirectory, "dispatcher.config.json"), "utf8"),
    ) as LocalConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error("dispatcher_config_unreadable");
  }
}

function safeArguments(value: unknown) {
  const canonical = ["exec", "--sandbox", "workspace-write", "--ask-for-approval", "never", "--json"];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    return canonical;
  }
  const arguments_ = value as string[];
  if (
    arguments_.some((argument) =>
      /dangerously-bypass|--yolo|danger-full-access|ignore-rules|ignore-user-config/i.test(argument),
    )
  ) {
    throw new Error("dispatcher_codex_arguments_unsafe");
  }
  if (arguments_.length !== canonical.length || arguments_.some((argument, index) => argument !== canonical[index])) {
    throw new Error("dispatcher_codex_arguments_incomplete");
  }
  return canonical;
}

export async function readDispatcherConfig(
  core: VerahOsConfig,
  source: Record<string, string | undefined> = process.env,
): Promise<DispatcherConfig> {
  const local = await readLocalConfig(core.runtimeDirectory);
  const from = (environmentName: string, localName: keyof LocalConfig) =>
    source[environmentName] ?? local[localName];
  const maxInvocationsPerWindow = bounded(
    from("VERAH_OS_DISPATCHER_MAX_INVOCATIONS", "maxInvocationsPerWindow"), 4, 1, 20,
  );
  const reserveInvocations = bounded(
    from("VERAH_OS_DISPATCHER_RESERVE_INVOCATIONS", "reserveInvocations"), 1, 1,
    Math.max(1, maxInvocationsPerWindow - 1),
  );
  const baseBackoffMs = bounded(
    from("VERAH_OS_DISPATCHER_BASE_BACKOFF_MS", "baseBackoffMs"), 60_000, 1_000, 3_600_000,
  );
  const maxBackoffMs = bounded(
    from("VERAH_OS_DISPATCHER_MAX_BACKOFF_MS", "maxBackoffMs"), 3_600_000,
    baseBackoffMs, 86_400_000,
  );
  let configuredArguments: unknown = local.codexArguments;
  if (source.VERAH_OS_CODEX_ARGUMENTS_JSON) {
    try {
      configuredArguments = JSON.parse(source.VERAH_OS_CODEX_ARGUMENTS_JSON);
    } catch {
      throw new Error("dispatcher_codex_arguments_unreadable");
    }
  }
  const codexCommand = String(from("VERAH_OS_CODEX_COMMAND", "codexCommand") ?? "codex");
  if (!/^codex(?:\.exe|\.cmd)?$/i.test(basename(codexCommand))) {
    throw new Error("dispatcher_codex_command_not_allowed");
  }
  const pollIntervalMs = bounded(from("VERAH_OS_DISPATCHER_POLL_MS", "pollIntervalMs"), 300_000, 10_000, 3_600_000);
  const heartbeatIntervalMs = bounded(from("VERAH_OS_DISPATCHER_HEARTBEAT_MS", "heartbeatIntervalMs"), 60_000, 10_000, 300_000);
  const watchdogTimeoutMs = bounded(from("VERAH_OS_DISPATCHER_WATCHDOG_MS", "watchdogTimeoutMs"), 900_000, 60_000, 3_600_000);
  if (pollIntervalMs >= watchdogTimeoutMs || heartbeatIntervalMs >= watchdogTimeoutMs) {
    throw new Error("dispatcher_watchdog_interval_invalid");
  }
  return {
    enabled: bool(from("VERAH_OS_DISPATCHER_ENABLED", "enabled"), false),
    dryRun: bool(from("VERAH_OS_DISPATCHER_DRY_RUN", "dryRun"), true),
    runtimeDirectory: core.runtimeDirectory,
    workspaceDirectory: core.workspaceDirectory,
    pollIntervalMs,
    heartbeatIntervalMs,
    watchdogTimeoutMs,
    windowDurationMs: bounded(from("VERAH_OS_DISPATCHER_WINDOW_MS", "windowDurationMs"), 28_800_000, 300_000, 86_400_000),
    maxCyclesPerWindow: bounded(from("VERAH_OS_DISPATCHER_MAX_CYCLES", "maxCyclesPerWindow"), 2, 1, 10),
    maxInvocationsPerWindow,
    maxInvocationDurationMs: bounded(from("VERAH_OS_DISPATCHER_INVOCATION_TIMEOUT_MS", "maxInvocationDurationMs"), 7_200_000, 60_000, 14_400_000),
    reserveInvocations,
    maxReportedTokensPerWindow: bounded(from("VERAH_OS_DISPATCHER_MAX_REPORTED_TOKENS", "maxReportedTokensPerWindow"), 250_000, 1_000, 2_000_000),
    baseBackoffMs,
    maxBackoffMs,
    codexCommand,
    codexArguments: safeArguments(configuredArguments),
  };
}
