/**
 * #170 — Non-production Control Plane runtime entrypoint.
 *
 * Long-running host process that composes the approved #147 architecture:
 * GitHub operational queue (issues labeled codex:authorized + codex:ready) ->
 * intake -> unattended queue -> lease -> role -> model router -> executor
 * router (createControlPlaneExecutorRouter) -> review gates -> operational
 * report.
 *
 * Fail-closed: NODE_ENV=production, a missing CONTROL_PLANE_RUNTIME_ENABLED
 * flag, an active CONTROL_PLANE_KILL_SWITCH, a missing GITHUB_TOKEN/GH_TOKEN
 * or no available executor (missing OpenHands Cloud credentials) all refuse
 * to start with a non-zero exit code and a sanitized reason. The dispatcher
 * is never invoked.
 *
 * Usage (non-production hosts only):
 *   CONTROL_PLANE_RUNTIME_ENABLED=true \
 *   CONTROL_PLANE_KILL_SWITCH=false \
 *   GITHUB_TOKEN=<token> \
 *   OPENHANDS_CLOUD_TRANSPORT_ENABLED=true \
 *   OPENHANDS_CLOUD_API_KEY=<key> \
 *   pnpm control-plane:runtime
 *
 * Exit codes: 0 = bounded run completed; 1 = refused to start or a cycle
 * failed closed. See docs/runbooks/control-plane-runtime.md.
 */

import {
  readControlPlaneRuntimeConfig,
} from "../services/control-plane/github-queue.ts";
import { createControlPlaneRuntime } from "../services/control-plane/runtime.ts";

const config = readControlPlaneRuntimeConfig(process.env);
if (!config.enabled) {
  console.error(`control_plane_runtime_refused: ${config.reason}`);
  process.exit(1);
}

const runtime = createControlPlaneRuntime(process.env, {
  logger: (event) => console.log(JSON.stringify(event)),
});
if (!runtime) {
  // Config is valid but no executor is available (missing OpenHands Cloud
  // credentials and no primary candidates): fail closed instead of running
  // an empty Control Plane.
  console.error("control_plane_runtime_refused: executor_unavailable");
  process.exit(1);
}

process.on("SIGINT", () => runtime.requestStop());
process.on("SIGTERM", () => runtime.requestStop());

console.log(
  JSON.stringify({
    type: "control_plane_runtime_start",
    repository: runtime.config.repository,
    maxCycles: runtime.config.maxCycles,
    pollIntervalMs: runtime.config.pollIntervalMs,
    environment: "non-production",
  }),
);

try {
  await runtime.run();
} catch (error) {
  console.error(
    `control_plane_runtime_failed: ${error instanceof Error ? error.message : "unknown"}`,
  );
  process.exit(1);
}

console.log(runtime.reportMarkdown());
console.log(
  JSON.stringify({ type: "control_plane_runtime_stop", cycles: runtime.config.maxCycles }),
);
