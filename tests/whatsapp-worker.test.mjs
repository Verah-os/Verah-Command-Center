import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  canSignWhatsAppMedia,
  downloadWhatsAppMedia,
  WHATSAPP_MEDIA_MAX_BYTES,
  WhatsAppWorkerError,
} from "../services/whatsapp/media.ts";
import { runWhatsAppWorker } from "../services/whatsapp/worker.ts";
import { handleWhatsAppWorkerRequest } from "../services/whatsapp/worker-handler.ts";

const secret = "synthetic-worker-secret-32-characters-minimum";

test("worker endpoint requires a configured constant-time bearer secret", async () => {
  let runs = 0;
  const denied = await handleWhatsAppWorkerRequest(
    new Request("https://example.test/worker", {
      method: "POST",
      headers: { authorization: "Bearer wrong" },
    }),
    { secret, available: true, async run() { runs += 1; } },
  );
  assert.equal(denied.status, 401);
  assert.equal(runs, 0);

  const unavailable = await handleWhatsAppWorkerRequest(
    new Request("https://example.test/worker", {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    }),
    { secret, available: false, async run() { runs += 1; } },
  );
  assert.equal(unavailable.status, 503);
  assert.equal(runs, 0);

  const accepted = await handleWhatsAppWorkerRequest(
    new Request("https://example.test/worker", {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    }),
    { secret, available: true, async run() { runs += 1; return { sent: 1 }; } },
  );
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { sent: 1 });
  assert.equal(runs, 1);
});

test("media download verifies MIME, size and checksum before accepting bytes", async () => {
  const bytes = new TextEncoder().encode("synthetic jpeg bytes");
  const checksum = createHash("sha256").update(bytes).digest("hex");
  let calls = 0;
  const downloaded = await downloadWhatsAppMedia(
    { externalMediaId: "media-1", declaredMimeType: "image/jpeg" },
    metaConfig(),
    async () => {
      calls += 1;
      return calls === 1
        ? Response.json({
            url: "https://media.example.test/file",
            mime_type: "image/jpeg",
            file_size: bytes.byteLength,
            sha256: checksum,
          })
        : new Response(bytes, {
            headers: {
              "content-type": "image/jpeg",
              "content-length": String(bytes.byteLength),
            },
          });
    },
  );
  assert.equal(downloaded.checksumSha256, checksum);
  assert.equal(downloaded.sizeBytes, bytes.byteLength);
  assert.equal(downloaded.mimeType, "image/jpeg");
  assert.equal(calls, 2);
});

test("media download rejects invalid, oversized and checksum-mismatched content", async () => {
  await assert.rejects(
    downloadWhatsAppMedia(
      { externalMediaId: "media-invalid", declaredMimeType: "text/html" },
      syntheticConfig(),
    ),
    (error) => error instanceof WhatsAppWorkerError && error.code === "invalid_media_mime" && !error.retryable,
  );

  await assert.rejects(
    downloadWhatsAppMedia(
      { externalMediaId: "media-large", declaredMimeType: "image/jpeg" },
      metaConfig(),
      async () => Response.json({
        url: "https://media.example.test/file",
        mime_type: "image/jpeg",
        file_size: WHATSAPP_MEDIA_MAX_BYTES + 1,
      }),
    ),
    (error) => error instanceof WhatsAppWorkerError && error.code === "media_too_large" && !error.retryable,
  );

  let calls = 0;
  await assert.rejects(
    downloadWhatsAppMedia(
      { externalMediaId: "media-checksum", declaredMimeType: "image/jpeg" },
      metaConfig(),
      async () => {
        calls += 1;
        return calls === 1
          ? Response.json({
              url: "https://media.example.test/file",
              mime_type: "image/jpeg",
              file_size: 3,
              sha256: "0".repeat(64),
            })
          : new Response("abc", { headers: { "content-type": "image/jpeg" } });
      },
    ),
    (error) => error instanceof WhatsAppWorkerError && error.code === "checksum_mismatch" && !error.retryable,
  );
});

test("synthetic media fallback is deterministic, local-only and never calls Meta", async () => {
  const first = await downloadWhatsAppMedia(
    { externalMediaId: "synthetic-media", declaredMimeType: "image/png" },
    syntheticConfig(),
    async () => { throw new Error("network must not be called"); },
  );
  const replay = await downloadWhatsAppMedia(
    { externalMediaId: "synthetic-media", declaredMimeType: "image/png" },
    syntheticConfig(),
    async () => { throw new Error("network must not be called"); },
  );
  assert.equal(first.checksumSha256, replay.checksumSha256);
  assert.deepEqual(first.bytes, replay.bytes);
});

test("worker completes batches, preserves retries and emits sanitized observability", async () => {
  const logs = [];
  const failed = [];
  const completed = [];
  const mediaBytes = new TextEncoder().encode("safe media");
  const downloaded = {
    bytes: mediaBytes,
    mimeType: "image/jpeg",
    sizeBytes: mediaBytes.byteLength,
    checksumSha256: createHash("sha256").update(mediaBytes).digest("hex"),
  };
  const result = await runWhatsAppWorker({
    async isOutboundEnabled() { return true; },
    async claimOutbox() {
      return [
        { outboxId: "outbox-ok", messageId: "message-ok", recipient: "+5511999999999", body: "private body", attemptCount: 1 },
        { outboxId: "outbox-retry", messageId: "message-retry", recipient: "+5511888888888", body: "another private body", attemptCount: 1 },
      ];
    },
    async completeOutbox(id) { completed.push(id); },
    async failOutbox(id, code, retryable) { failed.push({ id, code, retryable }); return "failed"; },
    async sendText({ to }) {
      if (to.endsWith("88888888")) throw new WhatsAppWorkerError("meta_rate_limited", true);
      return { status: "synthetic", externalMessageId: null };
    },
    async claimMedia() {
      return [{
        attachmentId: "attachment-ok",
        externalMediaId: "private-meta-id",
        mediaType: "image",
        declaredMimeType: "image/jpeg",
        storageBucket: "service-attachments",
        storagePath: "whatsapp/message/attachment",
        attemptCount: 1,
        retentionUntil: "2026-09-19T00:00:00.000Z",
      }];
    },
    async downloadMedia() { return downloaded; },
    async storeMedia() {},
    async completeMedia(id) { completed.push(id); },
    async failMedia() { return "failed"; },
    async purgeExpiredMedia() { return ["attachment-expired"]; },
    log(event) { logs.push(event); },
  });

  assert.deepEqual(result, { sent: 1, stored: 1, failed: 1, expired: 1 });
  assert.deepEqual(completed, ["outbox-ok", "attachment-ok"]);
  assert.deepEqual(failed, [{ id: "outbox-retry", code: "meta_rate_limited", retryable: true }]);
  const serializedLogs = JSON.stringify(logs);
  assert.doesNotMatch(serializedLogs, /5511|private body|private-meta-id|Bearer/i);
  assert.match(serializedLogs, /meta_rate_limited/);
});

test("outbound kill switch skips claims while inbound media maintenance remains available", async () => {
  let outboxClaims = 0;
  let mediaClaims = 0;
  await runWhatsAppWorker({
    async isOutboundEnabled() { return true; },
    async claimOutbox() { outboxClaims += 1; return []; },
    async completeOutbox() {}, async failOutbox() { return "failed"; }, async sendText() { throw new Error("must not send"); },
    async claimMedia() { mediaClaims += 1; return []; },
    async downloadMedia() { throw new Error("unused"); }, async storeMedia() {}, async completeMedia() {}, async failMedia() { return "failed"; },
    async purgeExpiredMedia() { return []; }, log() {},
  }, { outboundEnabled: false });
  assert.equal(outboxClaims, 0);
  assert.equal(mediaClaims, 1);
});

test("database kill switch blocks claims even when the environment switch is enabled", async () => {
  let outboxClaims = 0;
  let sends = 0;
  await runWhatsAppWorker({
    async isOutboundEnabled() { return false; },
    async claimOutbox() { outboxClaims += 1; return []; },
    async completeOutbox() {}, async failOutbox() { return "failed"; }, async sendText() { sends += 1; return { status: "synthetic", externalMessageId: null }; },
    async claimMedia() { return []; }, async downloadMedia() { throw new Error("unused"); },
    async storeMedia() {}, async completeMedia() {}, async failMedia() { return "failed"; },
    async purgeExpiredMedia() { return []; }, log() {},
  }, { outboundEnabled: true });
  assert.equal(outboxClaims, 0);
  assert.equal(sends, 0);
});

test("signed URLs are allowed only for available, unexpired private media", () => {
  const now = new Date("2026-08-20T00:00:00.000Z");
  assert.equal(canSignWhatsAppMedia({ status: "available", retentionUntil: "2026-08-21T00:00:00.000Z", now }), true);
  assert.equal(canSignWhatsAppMedia({ status: "processing", retentionUntil: "2026-08-21T00:00:00.000Z", now }), false);
  assert.equal(canSignWhatsAppMedia({ status: "available", retentionUntil: "2026-08-19T00:00:00.000Z", now }), false);
});

function metaConfig() {
  return {
    appSecret: "",
    verifyToken: "",
    accessToken: "synthetic-meta-token",
    phoneNumberId: "phone-id",
    apiVersion: "v99.0",
    syntheticMode: false,
  };
}

function syntheticConfig() {
  return { ...metaConfig(), accessToken: "", phoneNumberId: "", apiVersion: "", syntheticMode: true };
}
