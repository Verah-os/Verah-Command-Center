import {
  renderWhatsAppTemplate,
  validateWhatsAppMessageProposal,
  type WhatsAppMessageBasis,
  type WhatsAppMessageOrigin,
} from "./message-catalog.ts";

export type OutboundProfile =
  | { status: "authenticated"; profile: { role: string } }
  | { status: "unauthenticated" | "profile_missing" | "profile_invalid" | "error" };

type QueueInput = {
  conversationId: string;
  body: string;
  idempotencyKey: string;
  templateKey: string;
  variables: Record<string, unknown>;
  basis: WhatsAppMessageBasis;
  origin: WhatsAppMessageOrigin;
};

export async function handleOutboundMessage(
  request: Request,
  dependencies: {
    getProfile(): Promise<OutboundProfile>;
    outboundEnabled: boolean;
    queue(input: QueueInput): Promise<unknown>;
  },
) {
  const profile = await dependencies.getProfile();
  if (profile.status !== "authenticated") {
    return Response.json({ error: "authentication_required" }, { status: 401 });
  }
  if (
    profile.profile.role !== "concierge" &&
    profile.profile.role !== "admin"
  ) {
    return Response.json({ error: "access_denied" }, { status: 403 });
  }
  if (!dependencies.outboundEnabled) {
    return Response.json({ error: "outbound_disabled" }, { status: 503 });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const value = input as Record<string, unknown>;
  if (
    !value ||
    typeof value.conversationId !== "string" ||
    typeof value.body !== "string" ||
    typeof value.idempotencyKey !== "string" ||
    typeof value.templateKey !== "string" ||
    typeof value.variables !== "object" ||
    value.variables === null ||
    Array.isArray(value.variables) ||
    (value.basis !== "transactional" && value.basis !== "consent") ||
    value.origin !== "human" ||
    value.body.trim().length === 0 ||
    value.body.length > 10000 ||
    value.idempotencyKey.trim().length === 0 ||
    value.idempotencyKey.length > 200
  ) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const proposalError = validateWhatsAppMessageProposal({
    templateKey: value.templateKey,
    variables: value.variables as Record<string, unknown>,
    origin: value.origin,
  });
  if (proposalError) {
    return Response.json({ error: proposalError }, { status: 400 });
  }
  const renderedBody = renderWhatsAppTemplate(
    value.templateKey,
    value.variables as Record<string, unknown>,
  );
  if (!renderedBody || value.body !== renderedBody) {
    return Response.json({ error: "template_body_mismatch" }, { status: 400 });
  }

  await dependencies.queue({
    conversationId: value.conversationId,
    body: renderedBody,
    idempotencyKey: value.idempotencyKey,
    templateKey: value.templateKey,
    variables: value.variables as Record<string, unknown>,
    basis: value.basis,
    origin: value.origin,
  });
  return Response.json({ accepted: true, delivery: "outbox" }, { status: 202 });
}
