import { getCurrentProfileState } from "@/services/auth/profile";
import { handleOutboundMessage } from "@/services/whatsapp/outbound-handler";
import { queueOutboundMessage } from "@/services/whatsapp/repository";
import { canQueueWhatsAppOutbound, readWhatsAppConfig } from "@/services/whatsapp/config";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const config = readWhatsAppConfig(process.env);
  return handleOutboundMessage(request, {
    getProfile: getCurrentProfileState,
    outboundEnabled: canQueueWhatsAppOutbound(config),
    queue: queueOutboundMessage,
  });
}
