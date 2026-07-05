import { env } from "@/lib/env";

export async function dispatchN8nEvent(payload: unknown) {
  if (!env.n8nDispatcherWebhookUrl) {
    throw new Error("N8N_DISPATCHER_WEBHOOK_URL is required");
  }

  const response = await fetch(env.n8nDispatcherWebhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`n8n webhook failed with ${response.status}`);
  }

  return response.json().catch(() => ({ ok: true }));
}
