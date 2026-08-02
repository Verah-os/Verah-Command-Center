import { resolve } from "node:path";

import type { VerahOsConfig } from "./types.ts";

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}

export function readVerahOsConfig(
  source: Record<string, string | undefined>,
  cwd = process.cwd(),
): VerahOsConfig {
  const maxCorrectionAttempts = boundedInteger(
    source.VERAH_OS_MAX_CORRECTION_ATTEMPTS,
    2,
    2,
    2,
  ) as 2;

  return {
    enabled: source.VERAH_OS_UNATTENDED_ENABLED === "true",
    killSwitch: source.VERAH_OS_KILL_SWITCH !== "false",
    repository: "Verah-os/Verah-Command-Center",
    maintainers: new Set(
      (source.VERAH_OS_MAINTAINERS ?? "")
        .split(",")
        .map((login) => login.trim().toLowerCase())
        .filter(Boolean),
    ),
    maxDurationMs: boundedInteger(
      source.VERAH_OS_MAX_DURATION_MS,
      7_200_000,
      60_000,
      14_400_000,
    ),
    maxCorrectionAttempts,
    runtimeDirectory: resolve(cwd, ".verah-os"),
  };
}
