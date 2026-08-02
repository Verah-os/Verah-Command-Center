import { createHash } from "node:crypto";

import { buildDryRunPlan, parseIssueTemplate } from "./issue-template.ts";
import { sanitizePayload } from "./sanitization.ts";
import type {
  ControlPlaneConfig,
} from "./config.ts";
import type {
  DryRunCommand,
  DryRunPersistence,
  SyntheticIssueEvent,
} from "./types.ts";

const repositoryPattern = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const eventPattern = /^[A-Za-z0-9_.:-]{1,200}$/;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function parseSyntheticIssueEvent(value: unknown): SyntheticIssueEvent {
  const sanitized = sanitizePayload(value) as Record<string, unknown>;
  if (!sanitized || typeof sanitized !== "object") throw new Error("invalid_payload");
  const issue = sanitized.issue as Record<string, unknown> | undefined;
  const approval = sanitized.approval as Record<string, unknown> | undefined;

  if (
    typeof sanitized.eventId !== "string" ||
    !eventPattern.test(sanitized.eventId) ||
    !["opened", "edited", "labeled"].includes(String(sanitized.action)) ||
    typeof sanitized.repository !== "string" ||
    !repositoryPattern.test(sanitized.repository) ||
    !issue ||
    !Number.isSafeInteger(issue.number) ||
    Number(issue.number) <= 0 ||
    typeof issue.title !== "string" ||
    typeof issue.body !== "string" ||
    !isIsoDate(issue.updatedAt)
  ) {
    throw new Error("invalid_payload");
  }

  if (
    approval &&
    (!['approved', 'rejected'].includes(String(approval.decision)) ||
      typeof approval.maintainer !== "string" ||
      !isIsoDate(approval.decidedAt))
  ) {
    throw new Error("invalid_approval");
  }

  return sanitized as unknown as SyntheticIssueEvent;
}

export async function processSyntheticIssue(
  event: SyntheticIssueEvent,
  config: ControlPlaneConfig,
  persistence: DryRunPersistence,
) {
  if (!config.enabled) throw new Error("control_plane_disabled");
  if (config.killSwitch) throw new Error("kill_switch_active");

  const parsed = parseIssueTemplate(event);
  const maintainer = event.approval?.maintainer.trim().toLowerCase() ?? null;
  if (maintainer && !config.maintainers.has(maintainer)) {
    throw new Error("maintainer_not_authorized");
  }
  const approved = event.approval?.decision === "approved" && maintainer !== null;
  const plan = approved ? buildDryRunPlan(parsed) : null;
  const estimatedSteps = plan ? plan.steps.length + 4 : 1;
  const estimatedCostMicrounits = plan ? estimatedSteps * 100 : 0;

  const command: DryRunCommand = {
    deliveryId: event.eventId,
    repository: parsed.repository,
    issueNumber: parsed.number,
    issueUpdatedAt: parsed.updatedAt,
    title: parsed.title,
    bodySha256: sha256(event.issue.body),
    maintainer,
    approved,
    approvalEvidenceSha256: event.approval
      ? sha256(JSON.stringify(event.approval))
      : null,
    plan,
    budget: {
      ...config.budget,
      estimatedSteps,
      estimatedCostMicrounits,
    },
  };

  return persistence.process(command);
}
