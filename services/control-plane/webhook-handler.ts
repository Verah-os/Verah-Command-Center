import type { ControlPlaneConfig } from "./config.ts";
import { parseSyntheticIssueEvent, processSyntheticIssue } from "./intake.ts";
import { verifyControlPlaneSignature } from "./signature.ts";
import type { DryRunPersistence } from "./types.ts";

export const CONTROL_PLANE_MAX_PAYLOAD_BYTES = 128 * 1024;

export async function handleControlPlaneDryRunWebhook(
  request: Request,
  dependencies: {
    config: ControlPlaneConfig;
    persistence: DryRunPersistence;
  },
) {
  if (!dependencies.config.enabled) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (dependencies.config.killSwitch) {
    return Response.json({ error: "kill_switch_active" }, { status: 423 });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > CONTROL_PLANE_MAX_PAYLOAD_BYTES
  ) {
    return Response.json({ error: "payload_too_large" }, { status: 413 });
  }

  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength > CONTROL_PLANE_MAX_PAYLOAD_BYTES) {
    return Response.json({ error: "payload_too_large" }, { status: 413 });
  }
  if (
    !verifyControlPlaneSignature(
      body,
      request.headers.get("x-verah-signature-256"),
      dependencies.config.webhookSecret,
    )
  ) {
    return Response.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const report = await processSyntheticIssue(
      parseSyntheticIssueEvent(payload),
      dependencies.config,
      dependencies.persistence,
    );
    return Response.json({ accepted: true, report }, { status: 202 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "invalid_request";
    const status =
      code === "maintainer_not_authorized"
        ? 403
        : code === "kill_switch_active"
          ? 423
          : code === "control_plane_disabled"
            ? 404
            : 400;
    return Response.json({ error: code }, { status });
  }
}

