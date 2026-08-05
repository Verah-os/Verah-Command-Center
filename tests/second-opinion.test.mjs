import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSecondOpinionRequestInput,
  buildSecondOpinionResponseInput,
  buildSecondOpinionResultInput,
  buildVehicleMovementGuidanceInput,
} from "../services/second-opinion/input.ts";

const revisionId = "a7777777-7777-4777-8777-777777777771";
const providerId = "a5555555-5555-4555-8555-555555555552";
const assessmentId = "a9999999-9999-4999-8999-999999999991";
const requestId = "abbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";

test("builds a bounded second opinion request tied to a revision and assessment", () => {
  assert.deepEqual(
    buildSecondOpinionRequestInput({
      revisionId: revisionId.toUpperCase(),
      reviewProviderId: providerId,
      eligibilityAssessmentId: assessmentId,
      eligibilityJustification: " Revisão elegível por divergência de escopo. ",
      requestReason: "Validar o escopo técnico proposto.",
      idempotencyKey: " second-opinion-request-1 ",
    }),
    {
      p_revision_id: revisionId,
      p_review_provider_id: providerId,
      p_eligibility_assessment_id: assessmentId,
      p_eligibility_justification: "Revisão elegível por divergência de escopo.",
      p_request_reason: "Validar o escopo técnico proposto.",
      p_idempotency_key: "second-opinion-request-1",
    },
  );
});

test("requires a reason for refusal and rejects sensitive narratives", () => {
  assert.throws(
    () =>
      buildSecondOpinionResponseInput({
        requestId,
        decision: "declined",
        idempotencyKey: "decline-1",
      }),
    /second_opinion_decline_reason_required/,
  );
  assert.throws(
    () =>
      buildSecondOpinionRequestInput({
        revisionId,
        reviewProviderId: providerId,
        eligibilityAssessmentId: assessmentId,
        eligibilityJustification: "Contatar cliente@example.invalid",
        requestReason: "Validar escopo.",
        idempotencyKey: "request-2",
      }),
    /second_opinion_invalid_justification/,
  );
});

test("limits second opinion results to non-diagnostic outcomes", () => {
  assert.deepEqual(
    buildSecondOpinionResultInput({
      requestId,
      outcome: "professional_assessment_required",
      summary: "Avaliação presencial necessária para concluir a revisão.",
      idempotencyKey: "result-1",
    }).p_result_outcome,
    "professional_assessment_required",
  );
  assert.throws(
    () =>
      buildSecondOpinionResultInput({
        requestId,
        outcome: "vehicle_is_safe",
        summary: "Resultado inválido.",
        idempotencyKey: "result-2",
      }),
    /second_opinion_invalid_outcome/,
  );
});

test("vehicle movement input accepts only conservative guidance", () => {
  const input = buildVehicleMovementGuidanceInput({
    revisionId,
    secondOpinionRequestId: requestId,
    guidance: "tow_recommended",
    internalReason: "Movimentação depende de avaliação profissional.",
    idempotencyKey: "movement-1",
  });
  assert.equal(input.p_guidance_code, "tow_recommended");
  assert.equal(input.p_second_opinion_request_id, requestId);
  assert.throws(
    () =>
      buildVehicleMovementGuidanceInput({
        revisionId,
        guidance: "safe_to_drive",
        internalReason: "Inválido.",
        idempotencyKey: "movement-2",
      }),
    /vehicle_movement_invalid_guidance/,
  );
});
