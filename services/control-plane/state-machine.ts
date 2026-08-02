import type { ControlPlaneState } from "./types.ts";

const transitions: Readonly<Record<ControlPlaneState, readonly ControlPlaneState[]>> = {
  queued: ["planning", "waiting_approval", "blocked", "failed", "cancelled"],
  planning: ["completed", "blocked", "failed", "cancelled"],
  waiting_approval: ["queued", "blocked", "cancelled"],
  implementing: ["testing", "blocked", "failed", "cancelled"],
  testing: ["fixing", "pr_open", "blocked", "failed", "cancelled"],
  fixing: ["testing", "blocked", "failed", "cancelled"],
  pr_open: ["completed", "blocked", "cancelled"],
  blocked: ["queued", "cancelled"],
  completed: [],
  failed: ["queued", "cancelled"],
  cancelled: [],
};

export function canTransition(
  from: ControlPlaneState,
  to: ControlPlaneState,
) {
  return transitions[from].includes(to);
}
export function assertTransition(
  from: ControlPlaneState,
  to: ControlPlaneState,
) {
  if (!canTransition(from, to)) {
    throw new Error(`invalid_control_plane_transition:${from}:${to}`);
  }
}

export function isDryRunTransition(
  from: ControlPlaneState,
  to: ControlPlaneState,
) {
  return (
    canTransition(from, to) &&
    !["implementing", "testing", "fixing", "pr_open"].includes(to)
  );
}
