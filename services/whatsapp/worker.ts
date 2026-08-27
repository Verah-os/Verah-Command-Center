import type { DownloadedWhatsAppMedia } from "./media.ts";
import { WhatsAppWorkerError } from "./media.ts";
import type { MetaSendResult } from "./meta-adapter.ts";

export type ClaimedWhatsAppOutbox = {
  outboxId: string;
  messageId: string;
  recipient: string;
  body: string;
  attemptCount: number;
};

export type ClaimedWhatsAppMedia = {
  attachmentId: string;
  externalMediaId: string;
  mediaType: string;
  declaredMimeType: string | null;
  storageBucket: string;
  storagePath: string;
  attemptCount: number;
  retentionUntil: string;
};

export type WhatsAppWorkerLog = {
  job: "outbox" | "media" | "retention";
  recordId: string;
  status: "sent" | "stored" | "retry" | "rejected" | "expired";
  attempt?: number;
  errorCode?: string;
};

type WorkerDependencies = {
  isOutboundEnabled(): Promise<boolean>;
  claimOutbox(limit: number, maxAttempts: number): Promise<ClaimedWhatsAppOutbox[]>;
  completeOutbox(outboxId: string, externalMessageId: string | null): Promise<void>;
  failOutbox(outboxId: string, code: string, retryable: boolean, maxAttempts: number): Promise<string>;
  sendText(input: { to: string; body: string }): Promise<MetaSendResult>;
  claimMedia(limit: number, maxAttempts: number): Promise<ClaimedWhatsAppMedia[]>;
  downloadMedia(input: { externalMediaId: string; declaredMimeType: string | null }): Promise<DownloadedWhatsAppMedia>;
  storeMedia(media: ClaimedWhatsAppMedia, downloaded: DownloadedWhatsAppMedia): Promise<void>;
  completeMedia(attachmentId: string, downloaded: DownloadedWhatsAppMedia): Promise<void>;
  failMedia(attachmentId: string, code: string, retryable: boolean, maxAttempts: number): Promise<string>;
  purgeExpiredMedia(limit: number): Promise<string[]>;
  log(event: WhatsAppWorkerLog): void;
};

export async function runWhatsAppWorker(
  dependencies: WorkerDependencies,
  options: { batchSize?: number; maxAttempts?: number; outboundEnabled?: boolean } = {},
) {
  const batchSize = Math.min(50, Math.max(1, options.batchSize ?? 10));
  const maxAttempts = Math.min(3, Math.max(1, options.maxAttempts ?? 3));
  const result = { sent: 0, stored: 0, failed: 0, expired: 0 };

  const outboundEnabled = options.outboundEnabled !== false
    && await dependencies.isOutboundEnabled();
  const outbox = !outboundEnabled
    ? []
    : await dependencies.claimOutbox(batchSize, maxAttempts);
  for (const item of outbox) {
    try {
      const sent = await dependencies.sendText({
        to: item.recipient,
        body: item.body,
      });
      await dependencies.completeOutbox(item.outboxId, sent.externalMessageId);
      result.sent += 1;
      dependencies.log({
        job: "outbox",
        recordId: item.outboxId,
        status: "sent",
        attempt: item.attemptCount,
      });
    } catch (error) {
      const failure = safeFailure(error);
      const status = await dependencies.failOutbox(
        item.outboxId,
        failure.code,
        failure.retryable,
        maxAttempts,
      );
      result.failed += 1;
      dependencies.log({
        job: "outbox",
        recordId: item.outboxId,
        status: status === "dead_letter" ? "rejected" : "retry",
        attempt: item.attemptCount,
        errorCode: failure.code,
      });
    }
  }

  const media = await dependencies.claimMedia(batchSize, maxAttempts);
  for (const item of media) {
    try {
      const downloaded = await dependencies.downloadMedia({
        externalMediaId: item.externalMediaId,
        declaredMimeType: item.declaredMimeType,
      });
      await dependencies.storeMedia(item, downloaded);
      await dependencies.completeMedia(item.attachmentId, downloaded);
      result.stored += 1;
      dependencies.log({
        job: "media",
        recordId: item.attachmentId,
        status: "stored",
        attempt: item.attemptCount,
      });
    } catch (error) {
      const failure = safeFailure(error);
      const status = await dependencies.failMedia(
        item.attachmentId,
        failure.code,
        failure.retryable,
        maxAttempts,
      );
      result.failed += 1;
      dependencies.log({
        job: "media",
        recordId: item.attachmentId,
        status: status === "rejected" ? "rejected" : "retry",
        attempt: item.attemptCount,
        errorCode: failure.code,
      });
    }
  }

  const expiredIds = await dependencies.purgeExpiredMedia(batchSize);
  for (const recordId of expiredIds) {
    result.expired += 1;
    dependencies.log({ job: "retention", recordId, status: "expired" });
  }
  return result;
}

function safeFailure(error: unknown) {
  return error instanceof WhatsAppWorkerError
    ? { code: error.code, retryable: error.retryable }
    : { code: "unexpected_error", retryable: true };
}
