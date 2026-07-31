import {
  parseWhatsAppInboundPayload,
  WHATSAPP_WEBHOOK_MAX_BYTES,
  type ParsedInboundMessage,
} from "./payload.ts";
import { verifyWhatsAppSignature } from "./signature.ts";

export type WebhookDependencies = {
  appSecret: string;
  persistInbound(message: ParsedInboundMessage): Promise<void>;
};

export async function handleWhatsAppWebhook(
  request: Request,
  dependencies: WebhookDependencies,
) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > WHATSAPP_WEBHOOK_MAX_BYTES
  ) {
    return Response.json({ error: "payload_too_large" }, { status: 413 });
  }

  const rawBody = new Uint8Array(await request.arrayBuffer());
  if (rawBody.byteLength > WHATSAPP_WEBHOOK_MAX_BYTES) {
    return Response.json({ error: "payload_too_large" }, { status: 413 });
  }

  if (
    !verifyWhatsAppSignature(
      rawBody,
      request.headers.get("x-hub-signature-256"),
      dependencies.appSecret,
    )
  ) {
    return Response.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const messages = parseWhatsAppInboundPayload(payload);
  for (const message of messages) {
    await dependencies.persistInbound(message);
  }

  return Response.json({ accepted: true, messages: messages.length });
}

export function verifyWhatsAppWebhookChallenge(
  request: Request,
  verifyToken: string,
) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !challenge || token !== verifyToken) {
    return new Response("Forbidden", { status: 403 });
  }
  return new Response(challenge, { status: 200 });
}
