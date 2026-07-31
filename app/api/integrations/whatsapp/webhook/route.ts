import {
  canReceiveWebhook,
  readWhatsAppConfig,
} from "@/services/whatsapp/config";
import { persistInboundMessage } from "@/services/whatsapp/repository";
import {
  handleWhatsAppWebhook,
  verifyWhatsAppWebhookChallenge,
} from "@/services/whatsapp/webhook-handler";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const config = readWhatsAppConfig(process.env);
  if (!canReceiveWebhook(config)) {
    return Response.json({ error: "integration_unavailable" }, { status: 503 });
  }
  return verifyWhatsAppWebhookChallenge(request, config.verifyToken);
}

export async function POST(request: Request) {
  const config = readWhatsAppConfig(process.env);
  if (!canReceiveWebhook(config)) {
    return Response.json({ error: "integration_unavailable" }, { status: 503 });
  }
  return handleWhatsAppWebhook(request, {
    appSecret: config.appSecret,
    persistInbound: persistInboundMessage,
  });
}
