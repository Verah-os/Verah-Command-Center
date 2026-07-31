export type ControlPlaneConfig = {
  enabled: boolean;
  killSwitch: boolean;
  webhookSecret: string;
  maintainers: ReadonlySet<string>;
  budget: {
    maxDurationMs: number;
    maxSteps: number;
    maxCostMicrounits: number;
  };
};

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

export function readControlPlaneConfig(
  source: Record<string, string | undefined>,
): ControlPlaneConfig {
  const isProduction = source.NODE_ENV === "production";
  return {
    enabled:
      !isProduction && source.CONTROL_PLANE_DRY_RUN_ENABLED === "true",
    killSwitch: source.CONTROL_PLANE_KILL_SWITCH !== "false",
    webhookSecret: source.CONTROL_PLANE_DRY_RUN_WEBHOOK_SECRET ?? "",
    maintainers: new Set(
      (source.CONTROL_PLANE_MAINTAINERS ?? "")
        .split(",")
        .map((login) => login.trim().toLowerCase())
        .filter(Boolean),
    ),
    budget: {
      maxDurationMs: boundedInteger(
        source.CONTROL_PLANE_MAX_DURATION_MS,
        30_000,
        1_000,
        300_000,
      ),
      maxSteps: boundedInteger(source.CONTROL_PLANE_MAX_STEPS, 20, 1, 100),
      maxCostMicrounits: boundedInteger(
        source.CONTROL_PLANE_MAX_COST_MICROUNITS,
        10_000,
        0,
        1_000_000,
      ),
    },
  };
}

