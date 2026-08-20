import { N8nDeliveryError } from "./client.ts";
import { parseN8nContract } from "./contract.ts";

export type ClaimedN8nNotification = {
  outboxId: string;
  idempotencyKey: string;
  payload: unknown;
  attemptCount: number;
};

export type N8nWorkerLog = {
  recordId: string;
  status: "sent" | "retry" | "dead_letter";
  attempt: number;
  errorCode?: string;
};

type Dependencies = {
  enqueueSla(): Promise<number>;
  claim(limit: number, maxAttempts: number): Promise<ClaimedN8nNotification[]>;
  deliver(notification: ClaimedN8nNotification): Promise<void>;
  complete(outboxId: string): Promise<void>;
  fail(outboxId: string, code: string, retryable: boolean, maxAttempts: number): Promise<string>;
  report(): Promise<Record<string, unknown>>;
  log(event: N8nWorkerLog): void;
};

export async function runN8nWorker(
  dependencies: Dependencies,
  options: { batchSize?: number; maxAttempts?: number } = {},
) {
  const batchSize = Math.min(50, Math.max(1, options.batchSize ?? 10));
  const maxAttempts = Math.min(10, Math.max(1, options.maxAttempts ?? 5));
  const result = {
    enqueued: await dependencies.enqueueSla(),
    claimed: 0,
    sent: 0,
    retrying: 0,
    deadLetter: 0,
  };
  const notifications = await dependencies.claim(batchSize, maxAttempts);
  result.claimed = notifications.length;

  for (const notification of notifications) {
    try {
      parseN8nContract(notification.payload);
      await dependencies.deliver(notification);
      await dependencies.complete(notification.outboxId);
      result.sent += 1;
      dependencies.log({
        recordId: notification.outboxId,
        status: "sent",
        attempt: notification.attemptCount,
      });
    } catch (error) {
      const failure = safeFailure(error);
      const status = await dependencies.fail(
        notification.outboxId,
        failure.code,
        failure.retryable,
        maxAttempts,
      );
      if (status === "dead_letter") result.deadLetter += 1;
      else result.retrying += 1;
      dependencies.log({
        recordId: notification.outboxId,
        status: status === "dead_letter" ? "dead_letter" : "retry",
        attempt: notification.attemptCount,
        errorCode: failure.code,
      });
    }
  }

  return { ...result, report: await dependencies.report() };
}

function safeFailure(error: unknown) {
  if (error instanceof N8nDeliveryError) {
    return { code: error.code, retryable: error.retryable };
  }
  if (error instanceof Error && error.message.startsWith("n8n_contract_")) {
    return { code: error.message, retryable: false };
  }
  return { code: "n8n_unexpected_error", retryable: true };
}
