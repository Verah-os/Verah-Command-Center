import "server-only";

import type { ParsedInboundMessage } from "./payload";
import { createSupabaseAdminClient } from "@/services/supabase/admin";
import { createSupabaseServerClient } from "@/services/supabase/server";
import { processIntelligentIntakeMessage } from "@/services/intelligent-intake";

export async function persistInboundMessage(message: ParsedInboundMessage) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("persist_whatsapp_inbound_message", {
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
  await processIntelligentIntakeMessage(messageId);
}

export async function queueOutboundMessage(input: {
  conversationId: string;
  body: string;
  idempotencyKey: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(
    "queue_whatsapp_outbound_message",
    {
      p_conversation_id: input.conversationId,
      p_body: input.body,
      p_idempotency_key: input.idempotencyKey,
    },
  );
  if (error) throw new Error(`Outbound queue failed: ${error.code}`);
  return data;
}
