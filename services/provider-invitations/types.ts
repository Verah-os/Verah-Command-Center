export const PROVIDER_INVITATION_DECISIONS = ["accepted", "declined"] as const;
export type ProviderInvitationDecision =
  (typeof PROVIDER_INVITATION_DECISIONS)[number];

export type ProviderInvitationBriefing = Record<string, unknown>;
