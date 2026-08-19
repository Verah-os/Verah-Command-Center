import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProviderInvitationInput,
  buildProviderInvitationResponseInput,
  buildProviderInvitationRevocationInput,
  buildProviderSelectionInput,
} from "../services/provider-invitations/input.ts";

const requestId = "c1111111-1111-4111-8111-111111111111";
const revisionId = "c2222222-2222-4222-8222-222222222222";
const providerId = "c3333333-3333-4333-8333-333333333333";
const invitationId = "c4444444-4444-4444-8444-444444444444";

test("builds a bounded versioned invitation without contact data", () => {
  assert.deepEqual(
    buildProviderInvitationInput({
      serviceRequestId: requestId.toUpperCase(),
      revisionId,
      providerId,
      briefing: { summary: "Revisar escopo de freios", vehicle: "Honda Fit 2018" },
      expiresAt: "2026-08-20T12:00:00.000Z",
      idempotencyKey: " invite-1 ",
    }),
    {
      p_service_request_id: requestId,
      p_revision_id: revisionId,
      p_provider_id: providerId,
      p_briefing: { summary: "Revisar escopo de freios", vehicle: "Honda Fit 2018" },
      p_expires_at: "2026-08-20T12:00:00.000Z",
      p_idempotency_key: "invite-1",
    },
  );
  assert.throws(
    () => buildProviderInvitationInput({
      serviceRequestId: requestId,
      revisionId,
      providerId,
      briefing: { contact: "cliente@example.invalid" },
      expiresAt: "2026-08-20T12:00:00.000Z",
      idempotencyKey: "invite-2",
    }),
    /provider_invitation_invalid_briefing/,
  );
});

test("provider response is tied to one invitation and decline requires a reason", () => {
  assert.deepEqual(
    buildProviderInvitationResponseInput({
      invitationId,
      decision: "accepted",
      idempotencyKey: " response-1 ",
    }),
    {
      p_invitation_id: invitationId,
      p_decision: "accepted",
      p_note: null,
      p_idempotency_key: "response-1",
    },
  );
  assert.throws(
    () => buildProviderInvitationResponseInput({
      invitationId,
      decision: "declined",
      idempotencyKey: "response-2",
    }),
    /provider_invitation_decline_reason_required/,
  );
});

test("revocation and selection inputs require explicit idempotency and rationale", () => {
  assert.equal(
    buildProviderInvitationRevocationInput({ invitationId, idempotencyKey: "revoke-1" })
      .p_invitation_id,
    invitationId,
  );
  assert.equal(
    buildProviderSelectionInput({
      invitationId,
      rationale: "Seleção humana após revisão das respostas.",
      idempotencyKey: "selection-1",
    }).p_rationale,
    "Seleção humana após revisão das respostas.",
  );
  assert.throws(
    () => buildProviderSelectionInput({
      invitationId,
      rationale: " ",
      idempotencyKey: "selection-2",
    }),
    /provider_selection_invalid_rationale/,
  );
});
