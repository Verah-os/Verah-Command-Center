import {
  SECOND_OPINION_DECISIONS,
  SECOND_OPINION_OUTCOMES,
  VEHICLE_MOVEMENT_GUIDANCE,
  type SecondOpinionDecision,
  type SecondOpinionOutcome,
  type VehicleMovementGuidance,
} from "./types.ts";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const sensitivePattern =
  /(?:\b\d{7,}\b|[\w.+-]+@[\w.-]+\.[a-z]{2,}|bearer\s+|service[_-]?role|authorization)/i;

function normalizedUuid(value: string, errorCode: string) {
  const normalized = value.toLowerCase();
  if (!uuidPattern.test(normalized)) throw new Error(errorCode);
  return normalized;
}

function safeText(value: string, maximum: number, errorCode: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || sensitivePattern.test(normalized)) {
    throw new Error(errorCode);
  }
  return normalized;
}

function idempotencyKey(value: string) {
  return safeText(value, 200, "second_opinion_invalid_idempotency_key");
}

export function buildSecondOpinionRequestInput(input: {
  revisionId: string;
  reviewProviderId: string;
  eligibilityAssessmentId: string;
  eligibilityJustification: string;
  requestReason: string;
  idempotencyKey: string;
}) {
  return {
    p_revision_id: normalizedUuid(input.revisionId, "second_opinion_invalid_revision"),
    p_review_provider_id: normalizedUuid(
      input.reviewProviderId,
      "second_opinion_invalid_provider",
    ),
    p_eligibility_assessment_id: normalizedUuid(
      input.eligibilityAssessmentId,
      "second_opinion_invalid_assessment",
    ),
    p_eligibility_justification: safeText(
      input.eligibilityJustification,
      500,
      "second_opinion_invalid_justification",
    ),
    p_request_reason: safeText(
      input.requestReason,
      1000,
      "second_opinion_invalid_reason",
    ),
    p_idempotency_key: idempotencyKey(input.idempotencyKey),
  };
}

export function buildSecondOpinionResponseInput(input: {
  requestId: string;
  decision: SecondOpinionDecision;
  note?: string;
  idempotencyKey: string;
}) {
  if (!SECOND_OPINION_DECISIONS.includes(input.decision)) {
    throw new Error("second_opinion_invalid_decision");
  }
  const note = input.note?.trim() || null;
  if (input.decision === "declined" && !note) {
    throw new Error("second_opinion_decline_reason_required");
  }
  return {
    p_request_id: normalizedUuid(input.requestId, "second_opinion_invalid_request"),
    p_decision: input.decision,
    p_note: note
      ? safeText(note, 1000, "second_opinion_invalid_response_note")
      : null,
    p_idempotency_key: idempotencyKey(input.idempotencyKey),
  };
}

export function buildSecondOpinionResultInput(input: {
  requestId: string;
  outcome: SecondOpinionOutcome;
  summary: string;
  idempotencyKey: string;
}) {
  if (!SECOND_OPINION_OUTCOMES.includes(input.outcome)) {
    throw new Error("second_opinion_invalid_outcome");
  }
  return {
    p_request_id: normalizedUuid(input.requestId, "second_opinion_invalid_request"),
    p_result_outcome: input.outcome,
    p_result_summary: safeText(
      input.summary,
      1000,
      "second_opinion_invalid_result_summary",
    ),
    p_idempotency_key: idempotencyKey(input.idempotencyKey),
  };
}

export function buildVehicleMovementGuidanceInput(input: {
  revisionId: string;
  secondOpinionRequestId?: string;
  guidance: VehicleMovementGuidance;
  internalReason: string;
  idempotencyKey: string;
}) {
  if (!VEHICLE_MOVEMENT_GUIDANCE.includes(input.guidance)) {
    throw new Error("vehicle_movement_invalid_guidance");
  }
  return {
    p_revision_id: normalizedUuid(input.revisionId, "vehicle_movement_invalid_revision"),
    p_second_opinion_request_id: input.secondOpinionRequestId
      ? normalizedUuid(
          input.secondOpinionRequestId,
          "vehicle_movement_invalid_second_opinion",
        )
      : null,
    p_guidance_code: input.guidance,
    p_internal_reason: safeText(
      input.internalReason,
      1000,
      "vehicle_movement_invalid_reason",
    ),
    p_idempotency_key: idempotencyKey(input.idempotencyKey),
  };
}
