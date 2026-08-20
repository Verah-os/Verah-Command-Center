import {
  PROVIDER_INVITATION_DECISIONS,
  type ProviderInvitationBriefing,
  type ProviderInvitationDecision,
} from "./types.ts";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const sensitivePattern =
  /(?:(?:\+?\d[\s().-]*){7,}|[\w.+-]+@[\w.-]+\.[a-z]{2,}|bearer\s+|service[_-]?role|authorization)/i;

function uuid(value: string, error: string) {
  const normalized = value.toLowerCase();
  if (!uuidPattern.test(normalized)) throw new Error(error);
  return normalized;
}

function safeText(value: string, maximum: number, error: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || sensitivePattern.test(normalized)) {
    throw new Error(error);
  }
  return normalized;
}

function idempotencyKey(value: string) {
  return safeText(value, 200, "provider_invitation_invalid_idempotency_key");
}

export function buildProviderInvitationInput(input: {
  serviceRequestId: string;
  revisionId: string;
  providerId: string;
  briefing: ProviderInvitationBriefing;
  expiresAt: string;
  idempotencyKey: string;
}) {
  const briefing = JSON.stringify(input.briefing);
  const expiresAt = new Date(input.expiresAt);
  if (
    !briefing ||
    Array.isArray(input.briefing) ||
    briefing.length > 4000 ||
    sensitivePattern.test(briefing)
  ) {
    throw new Error("provider_invitation_invalid_briefing");
  }
  if (Number.isNaN(expiresAt.valueOf())) {
    throw new Error("provider_invitation_invalid_expiry");
  }
  return {
    p_service_request_id: uuid(input.serviceRequestId, "provider_invitation_invalid_request"),
    p_revision_id: uuid(input.revisionId, "provider_invitation_invalid_revision"),
    p_provider_id: uuid(input.providerId, "provider_invitation_invalid_provider"),
    p_briefing: input.briefing,
    p_expires_at: expiresAt.toISOString(),
    p_idempotency_key: idempotencyKey(input.idempotencyKey),
  };
}

export function buildProviderInvitationResponseInput(input: {
  invitationId: string;
  decision: ProviderInvitationDecision;
  note?: string;
  idempotencyKey: string;
}) {
  if (!PROVIDER_INVITATION_DECISIONS.includes(input.decision)) {
    throw new Error("provider_invitation_invalid_decision");
  }
  const note = input.note?.trim() || null;
  if (input.decision === "declined" && !note) {
    throw new Error("provider_invitation_decline_reason_required");
  }
  return {
    p_invitation_id: uuid(input.invitationId, "provider_invitation_invalid_invitation"),
    p_decision: input.decision,
    p_note: note ? safeText(note, 1000, "provider_invitation_invalid_note") : null,
    p_idempotency_key: idempotencyKey(input.idempotencyKey),
  };
}

export function buildProviderInvitationRevocationInput(input: {
  invitationId: string;
  idempotencyKey: string;
}) {
  return {
    p_invitation_id: uuid(input.invitationId, "provider_invitation_invalid_invitation"),
    p_idempotency_key: idempotencyKey(input.idempotencyKey),
  };
}

export function buildProviderSelectionInput(input: {
  invitationId: string;
  rationale: string;
  idempotencyKey: string;
}) {
  return {
    p_invitation_id: uuid(input.invitationId, "provider_invitation_invalid_invitation"),
    p_rationale: safeText(input.rationale, 1000, "provider_selection_invalid_rationale"),
    p_idempotency_key: idempotencyKey(input.idempotencyKey),
  };
}
