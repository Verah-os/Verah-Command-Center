import "server-only";

import { createSupabaseAdminClient } from "@/services/supabase/admin";
import type { ClaimedN8nNotification } from "./worker";

export async function enqueueN8nSlaNotifications() {
  const { data, error } = await createSupabaseAdminClient().rpc("enqueue_n8n_sla_notifications");
  if (error) throw new Error(`n8n SLA enqueue failed: ${error.code}`);
  return Number(data ?? 0);
}

export async function claimN8nNotifications(limit: number, maxAttempts: number) {
  const { data, error } = await createSupabaseAdminClient().rpc("claim_n8n_notifications", {
    p_limit: limit,
    p_max_attempts: maxAttempts,
  });
  if (error) throw new Error(`n8n claim failed: ${error.code}`);
  return ((data ?? []) as Array<Record<string, unknown>>).map(
    (row) => ({
      outboxId: row.outbox_id,
      idempotencyKey: row.idempotency_key,
      payload: row.payload,
      attemptCount: row.attempt_count,
    }) as ClaimedN8nNotification,
  );
}

export async function completeN8nNotification(outboxId: string) {
  const { error } = await createSupabaseAdminClient().rpc("complete_n8n_notification", {
    p_outbox_id: outboxId,
  });
  if (error) throw new Error(`n8n completion failed: ${error.code}`);
}

export async function failN8nNotification(
  outboxId: string,
  code: string,
  retryable: boolean,
  maxAttempts: number,
) {
  const { data, error } = await createSupabaseAdminClient().rpc("fail_n8n_notification", {
    p_outbox_id: outboxId,
    p_error_code: code,
    p_retryable: retryable,
    p_max_attempts: maxAttempts,
  });
  if (error) throw new Error(`n8n failure update failed: ${error.code}`);
  return data as string;
}

export async function getN8nNotificationReport() {
  const { data, error } = await createSupabaseAdminClient().rpc("get_n8n_notification_report");
  if (error) throw new Error(`n8n report failed: ${error.code}`);
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? {}) as Record<string, unknown>;
}
