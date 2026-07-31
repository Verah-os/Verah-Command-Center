import { getCurrentProfileState } from "@/services/auth/profile";
import { handleOutboundMessage } from "@/services/whatsapp/outbound-handler";
import { queueOutboundMessage } from "@/services/whatsapp/repository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleOutboundMessage(request, {
    getProfile: getCurrentProfileState,
    queue: queueOutboundMessage,
  });
}
