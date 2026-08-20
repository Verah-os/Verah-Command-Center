import {
  canRunWhatsAppWorker,
  readWhatsAppConfig,
  readWhatsAppWorkerSecret,
} from "@/services/whatsapp/config";
import { downloadWhatsAppMedia } from "@/services/whatsapp/media";
import { createMetaWhatsAppAdapter } from "@/services/whatsapp/meta-adapter";
import {
  claimWhatsAppMedia,
  claimWhatsAppOutbox,
  completeWhatsAppMedia,
  completeWhatsAppOutbox,
  failWhatsAppMedia,
  failWhatsAppOutbox,
  purgeExpiredWhatsAppMedia,
  storeWhatsAppMedia,
} from "@/services/whatsapp/repository";
import { runWhatsAppWorker } from "@/services/whatsapp/worker";
import { handleWhatsAppWorkerRequest } from "@/services/whatsapp/worker-handler";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const config = readWhatsAppConfig(process.env);
  const adapter = createMetaWhatsAppAdapter(config);
  return handleWhatsAppWorkerRequest(request, {
    secret: readWhatsAppWorkerSecret(process.env),
    available: canRunWhatsAppWorker(config),
    run: () =>
      runWhatsAppWorker({
        claimOutbox: claimWhatsAppOutbox,
        completeOutbox: completeWhatsAppOutbox,
        failOutbox: failWhatsAppOutbox,
        sendText: adapter.sendText,
        claimMedia: claimWhatsAppMedia,
        downloadMedia: (input) => downloadWhatsAppMedia(input, config),
        storeMedia: storeWhatsAppMedia,
        completeMedia: completeWhatsAppMedia,
        failMedia: failWhatsAppMedia,
        purgeExpiredMedia: purgeExpiredWhatsAppMedia,
        log: (event) => console.info("whatsapp_worker", event),
      }),
  });
}
