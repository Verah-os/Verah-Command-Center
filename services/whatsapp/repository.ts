import "server-only";

import { createHash } from "node:crypto";
import type { ParsedInboundMessage } from "./payload";
import {
  WhatsAppWorkerError,
  type DownloadedWhatsAppMedia,
} from "./media";
import type {
  ClaimedWhatsAppMedia,
  ClaimedWhatsAppOutbox,
} from "./worker";
import { createSupabaseAdminClient } from "@/services/supabase/admin";
import { createSupabaseServerClient } from "@/services/supabase/server";
import { processIntelligentIntakeMessage } from "@/services/intelligent-intake";

export async function persistInboundMessage(message: ParsedInboundMessage) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("persist_whatsapp_inbound_message_safe", {
    p_phone: message.phone,
    p_external_message_id: message.externalMessageId,
    p_message_type: message.messageType,
    p_body: message.body,
    p_provider_timestamp: message.providerTimestamp,
    p_sanitized_metadata: message.sanitizedMetadata,
  });
  if (error) throw new Error(`Inbound persistence failed: ${error.code}`);
  const row = Array.isArray(data) ? data[0] : data;
  const messageId = row?.message_id as string | undefined;
  if (!messageId) throw new Error("Inbound persistence returned no message id");
  if (row?.conversation_id) await processIntelligentIntakeMessage(messageId);
}

export async function queueOutboundMessage(input: {
  conversationId: string;
  body: string;
  idempotencyKey: string;
  templateKey: string;
  variables: Record<string, unknown>;
  basis: "transactional" | "consent";
  origin: "human" | "system" | "agent_proposal";
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(
    "queue_whatsapp_outbound_message_gated",
    {
      p_conversation_id: input.conversationId,
      p_body: input.body,
      p_idempotency_key: input.idempotencyKey,
      p_template_key: input.templateKey,
      p_template_variables: input.variables,
      p_message_basis: input.basis,
      p_origin: input.origin,
    },
  );
  if (error) throw new Error(`Outbound queue failed: ${error.code}`);
  return data;
}

export async function claimWhatsAppOutbox(
  limit: number,
  maxAttempts: number,
) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("claim_whatsapp_outbox_gated", {
    p_limit: limit,
    p_max_attempts: maxAttempts,
  });
  if (error) throw new Error(`Outbox claim failed: ${error.code}`);
  return ((data ?? []) as Array<Record<string, unknown>>).map(
    (row) =>
      ({
        outboxId: row.outbox_id,
        messageId: row.message_id,
        recipient: row.recipient,
        body: row.body,
        attemptCount: row.attempt_count,
      }) as ClaimedWhatsAppOutbox,
  );
}

export async function isWhatsAppOutboundEnabled() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("whatsapp_readiness_snapshot");
  if (error) throw new Error(`Outbound control lookup failed: ${error.code}`);
  return Boolean((data as Record<string, unknown> | null)?.outbound_enabled);
}

export async function completeWhatsAppOutbox(
  outboxId: string,
  externalMessageId: string | null,
) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc("complete_whatsapp_outbox", {
    p_outbox_id: outboxId,
    p_external_message_id: externalMessageId,
  });
  if (error) throw new Error(`Outbox completion failed: ${error.code}`);
}

export async function failWhatsAppOutbox(
  outboxId: string,
  code: string,
  retryable: boolean,
  maxAttempts: number,
) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("fail_whatsapp_outbox", {
    p_outbox_id: outboxId,
    p_error_code: code,
    p_retryable: retryable,
    p_max_attempts: maxAttempts,
  });
  if (error) throw new Error(`Outbox failure update failed: ${error.code}`);
  return data as string;
}

export async function claimWhatsAppMedia(limit: number, maxAttempts: number) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("claim_whatsapp_media", {
    p_limit: limit,
    p_max_attempts: maxAttempts,
  });
  if (error) throw new Error(`Media claim failed: ${error.code}`);
  return ((data ?? []) as Array<Record<string, unknown>>).map(
    (row) =>
      ({
        attachmentId: row.attachment_id,
        externalMediaId: row.external_media_id,
        mediaType: row.media_type,
        declaredMimeType: row.declared_mime_type,
        storageBucket: row.storage_bucket,
        storagePath: row.storage_path,
        attemptCount: row.attempt_count,
        retentionUntil: row.retention_until,
      }) as ClaimedWhatsAppMedia,
  );
}

export async function storeWhatsAppMedia(
  media: ClaimedWhatsAppMedia,
  downloaded: DownloadedWhatsAppMedia,
) {
  const supabase = createSupabaseAdminClient();
  const bucket = supabase.storage.from(media.storageBucket);
  const { error } = await bucket.upload(media.storagePath, downloaded.bytes, {
    contentType: downloaded.mimeType,
    upsert: false,
  });
  if (!error) return;

  const { data: existing, error: downloadError } = await bucket.download(
    media.storagePath,
  );
  if (downloadError || !existing) {
    throw new WhatsAppWorkerError("media_storage_failed", true);
  }
  const bytes = new Uint8Array(await existing.arrayBuffer());
  const checksum = createHash("sha256").update(bytes).digest("hex");
  if (checksum !== downloaded.checksumSha256) {
    throw new WhatsAppWorkerError("media_storage_conflict", false);
  }
}

export async function completeWhatsAppMedia(
  attachmentId: string,
  downloaded: DownloadedWhatsAppMedia,
) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc("complete_whatsapp_media", {
    p_attachment_id: attachmentId,
    p_detected_mime_type: downloaded.mimeType,
    p_size_bytes: downloaded.sizeBytes,
    p_checksum_sha256: downloaded.checksumSha256,
  });
  if (error) throw new Error(`Media completion failed: ${error.code}`);
}

export async function failWhatsAppMedia(
  attachmentId: string,
  code: string,
  retryable: boolean,
  maxAttempts: number,
) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("fail_whatsapp_media", {
    p_attachment_id: attachmentId,
    p_error_code: code,
    p_retryable: retryable,
    p_max_attempts: maxAttempts,
  });
  if (error) throw new Error(`Media failure update failed: ${error.code}`);
  return data as string;
}

export async function purgeExpiredWhatsAppMedia(limit: number) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("service_attachments")
    .select("id,storage_bucket,storage_path")
    .eq("status", "available")
    .lte("retention_until", new Date().toISOString())
    .order("retention_until", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Media retention query failed: ${error.code}`);

  const expired: string[] = [];
  for (const attachment of data ?? []) {
    const { error: removeError } = await supabase.storage
      .from(attachment.storage_bucket)
      .remove([attachment.storage_path]);
    if (removeError) continue;
    const { error: updateError } = await supabase
      .from("service_attachments")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", attachment.id)
      .eq("status", "available");
    if (!updateError) expired.push(attachment.id);
  }
  return expired;
}
