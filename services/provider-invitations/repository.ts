import "server-only";

import { createSupabaseServerClient } from "@/services/supabase/server";
import {
  buildProviderInvitationInput,
  buildProviderInvitationResponseInput,
  buildProviderInvitationRevocationInput,
  buildProviderSelectionInput,
} from "./input";
import type { ProviderInvitationBriefing, ProviderInvitationDecision } from "./types";

async function invoke(name: string, input: Record<string, unknown>, errorCode: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(name, input);
  if (error) throw new Error(`${errorCode}:${error.code}`);
  return data as string;
}

export function inviteServiceProvider(input: {
  serviceRequestId: string;
  revisionId: string;
  providerId: string;
  briefing: ProviderInvitationBriefing;
  expiresAt: string;
  idempotencyKey: string;
}) {
  return invoke(
    "invite_service_provider",
    buildProviderInvitationInput(input),
    "provider_invitation_failed",
  );
}

export function respondToProviderInvitation(input: {
  invitationId: string;
  decision: ProviderInvitationDecision;
  note?: string;
  idempotencyKey: string;
}) {
  return invoke(
    "respond_to_provider_invitation",
    buildProviderInvitationResponseInput(input),
    "provider_invitation_response_failed",
  );
}

export function revokeProviderInvitation(input: {
  invitationId: string;
  idempotencyKey: string;
}) {
  return invoke(
    "revoke_provider_invitation",
    buildProviderInvitationRevocationInput(input),
    "provider_invitation_revocation_failed",
  );
}

export function selectProviderInvitation(input: {
  invitationId: string;
  rationale: string;
  idempotencyKey: string;
}) {
  return invoke(
    "select_provider_invitation",
    buildProviderSelectionInput(input),
    "provider_selection_failed",
  );
}
