import { readControlPlaneConfig } from "@/services/control-plane/config";
import { controlPlanePersistence } from "@/services/control-plane/repository";
import { handleControlPlaneDryRunWebhook } from "@/services/control-plane/webhook-handler";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleControlPlaneDryRunWebhook(request, {
    config: readControlPlaneConfig(process.env),
    persistence: controlPlanePersistence,
  });
}
