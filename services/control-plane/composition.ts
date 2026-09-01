import {
  PolicyExecutorRouter,
  type ExecutorCandidate,
  type ExecutorRoutingMode,
} from "./executor-router.ts";
import {
  createOpenHandsCloudExecutor,
  type OpenHandsCloudTransportOptions,
} from "./openhands-cloud-transport.ts";
import type { OpenHandsExecutorOptions } from "./openhands-executor.ts";

// Fallback position: any real primary executor must outrank OpenHands Cloud,
// which only runs when every higher-priority candidate is unavailable.
export const OPENHANDS_CLOUD_FALLBACK_PRIORITY = 100;
// Placeholder estimate so "lowest_cost" routing never prefers the fallback
// over a primary with a known price; real cost is recorded after each run.
export const OPENHANDS_CLOUD_FALLBACK_ESTIMATED_COST_MICROUNITS = 1_000_000;

export type ControlPlaneExecutorCompositionOptions = {
  primaryCandidates?: readonly ExecutorCandidate[];
  openhands?: OpenHandsCloudTransportOptions & {
    executorOptions?: OpenHandsExecutorOptions;
  };
  routingMode?: ExecutorRoutingMode;
};

// Runtime composition: the single place where the environment can activate
// the OpenHands Cloud transport. Returns null when no executor is available
// so the host fails closed instead of constructing an empty router.
export function createControlPlaneExecutorRouter(
  source: Record<string, string | undefined>,
  options: ControlPlaneExecutorCompositionOptions = {},
): PolicyExecutorRouter | null {
  const candidates: ExecutorCandidate[] = [...options.primaryCandidates ?? []];
  const openhands = createOpenHandsCloudExecutor(source, options.openhands);
  if (openhands && !candidates.some((c) => c.executor.id === openhands.id)) {
    candidates.push({
      executor: openhands,
      priority: OPENHANDS_CLOUD_FALLBACK_PRIORITY,
      estimatedCostMicrounits: OPENHANDS_CLOUD_FALLBACK_ESTIMATED_COST_MICROUNITS,
    });
  }
  if (candidates.length === 0) return null;
  return new PolicyExecutorRouter(candidates, options.routingMode ?? "priority");
}
