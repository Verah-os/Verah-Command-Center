import type { N8nConfig } from "./config.ts";
import type { N8nNotificationContractV1 } from "./contract.ts";

export class N8nDeliveryError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, retryable: boolean) {
    super(code);
    this.code = code;
    this.retryable = retryable;
  }
}

export async function dispatchN8nEvent(
  contract: N8nNotificationContractV1,
  idempotencyKey: string,
  config: N8nConfig,
  fetchImpl: typeof fetch = fetch,
) {
  const response = await fetchImpl(config.webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.webhookAuthToken}`,
      "Idempotency-Key": idempotencyKey,
      "X-Verah-Contract-Version": "1",
    },
    body: JSON.stringify(contract),
    signal: AbortSignal.timeout(config.timeoutMs),
  });

  if (!response.ok) {
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    throw new N8nDeliveryError(`n8n_http_${response.status}`, retryable);
  }
}
