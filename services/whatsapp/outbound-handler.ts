export type OutboundProfile =
  | { status: "authenticated"; profile: { role: string } }
  | { status: "unauthenticated" | "profile_missing" | "profile_invalid" | "error" };

type QueueInput = {
  conversationId: string;
  body: string;
  idempotencyKey: string;
};

export async function handleOutboundMessage(
  request: Request,
  dependencies: {
    getProfile(): Promise<OutboundProfile>;
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
    value.body.trim().length === 0 ||
    value.body.length > 10000 ||
    value.idempotencyKey.trim().length === 0 ||
    value.idempotencyKey.length > 200
  ) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  await dependencies.queue({
    conversationId: value.conversationId,
    body: value.body,
    idempotencyKey: value.idempotencyKey,
  });
  return Response.json({ accepted: true, delivery: "outbox" }, { status: 202 });
}
