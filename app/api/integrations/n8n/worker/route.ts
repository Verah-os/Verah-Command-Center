import { dispatchN8nEvent } from "@/services/n8n/client";
import { canDispatchN8n, readN8nConfig } from "@/services/n8n/config";
import {
  claimN8nNotifications,
  completeN8nNotification,
  enqueueN8nSlaNotifications,
  failN8nNotification,
  getN8nNotificationReport,
} from "@/services/n8n/repository";
import { parseN8nContract } from "@/services/n8n/contract";
import { runN8nWorker } from "@/services/n8n/worker";
import { handleN8nWorkerRequest } from "@/services/n8n/worker-handler";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const config = readN8nConfig(process.env);
  return handleN8nWorkerRequest(request, {
    secret: config.workerSecret,
    enabled: config.enabled,
    available: canDispatchN8n(config),
    run: () => runN8nWorker({
      enqueueSla: enqueueN8nSlaNotifications,
      claim: claimN8nNotifications,
      complete: completeN8nNotification,
      fail: failN8nNotification,
      report: getN8nNotificationReport,
      deliver: (notification) => dispatchN8nEvent(
        parseN8nContract(notification.payload),
        notification.idempotencyKey,
        config,
      ),
      log: (event) => console.info("n8n_notification_worker", event),
    }),
  });
}
