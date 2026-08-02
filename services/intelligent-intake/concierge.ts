import "server-only";

import { createSupabaseServerClient } from "@/services/supabase/server";
import type { IntakeCollectedData } from "./types";

export type ConciergeIntakeDetails = {
  collectedData: IntakeCollectedData;
  correlationId: string;
  summary: string;
  normalizedSymptoms: string[];
  conditions: string[];
  hypotheses: Array<{ label: string; basis: string }>;
  riskLevel: string;
  riskFlags: string[];
  missingQuestions: string[];
  safeNextStep: string;
  confidence: number;
  engineVersion: string;
  createdAt: string;
  attachments: Array<{
    id: string;
    mediaType: string;
    mimeType: string | null;
    status: string;
    createdAt: string;
    signedUrl: string | null;
  }>;
};

export async function getConciergeIntakeDetails(serviceRequestId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: session, error: sessionError } = await supabase
    .from("intake_sessions")
    .select("id,conversation_id,correlation_id,collected_data")
    .eq("service_request_id", serviceRequestId)
    .maybeSingle();
  if (sessionError || !session) return null;

  const [{ data: assessment }, { data: attachments }, { data: mediaMessages }] = await Promise.all([
    supabase
      .from("intake_assessments")
      .select(
        "summary,normalized_symptoms,conditions,hypotheses,risk_level,risk_flags,missing_questions,safe_next_step,confidence,engine_version,created_at",
      )
      .eq("intake_session_id", session.id)
      .maybeSingle(),
    supabase
      .from("service_attachments")
      .select(
        "id,message_id,storage_bucket,storage_path,media_type,declared_mime_type,detected_mime_type,status,created_at",
      )
      .eq("conversation_id", session.conversation_id)
      .order("created_at", { ascending: true }),
    supabase
      .from("service_messages")
      .select("id,message_type,sanitized_metadata,created_at")
      .eq("conversation_id", session.conversation_id)
      .eq("direction", "inbound")
      .in("message_type", ["image", "video", "audio", "document"])
      .order("created_at", { ascending: true }),
  ]);
  if (!assessment) return null;

  const resolvedAttachments = await Promise.all(
    (attachments ?? []).map(async (attachment) => {
      const { data } = await supabase.storage
        .from(attachment.storage_bucket)
        .createSignedUrl(attachment.storage_path, 300);
      return {
        id: attachment.id,
        mediaType: attachment.media_type,
        mimeType:
          attachment.detected_mime_type ?? attachment.declared_mime_type,
        status: attachment.status,
        createdAt: attachment.created_at,
        signedUrl: data?.signedUrl ?? null,
      };
    }),
  );
  const storedMessageIds = new Set(
    (attachments ?? []).map((attachment) => attachment.message_id).filter(Boolean),
  );
  const metadataOnlyAttachments = (mediaMessages ?? [])
    .filter((message) => !storedMessageIds.has(message.id))
    .map((message) => ({
      id: `message-${message.id}`,
      mediaType: message.message_type,
      mimeType:
        typeof message.sanitized_metadata === "object" &&
        message.sanitized_metadata !== null &&
        "mime_type" in message.sanitized_metadata &&
        typeof message.sanitized_metadata.mime_type === "string"
          ? message.sanitized_metadata.mime_type
          : null,
      status: "metadata_received",
      createdAt: message.created_at,
      signedUrl: null,
    }));

  return {
    collectedData: session.collected_data as IntakeCollectedData,
    correlationId: session.correlation_id,
    summary: assessment.summary,
    normalizedSymptoms: assessment.normalized_symptoms as string[],
    conditions: assessment.conditions as string[],
    hypotheses: assessment.hypotheses as Array<{ label: string; basis: string }>,
    riskLevel: assessment.risk_level,
    riskFlags: assessment.risk_flags as string[],
    missingQuestions: assessment.missing_questions as string[],
    safeNextStep: assessment.safe_next_step,
    confidence: Number(assessment.confidence),
    engineVersion: assessment.engine_version,
    createdAt: assessment.created_at,
    attachments: [...resolvedAttachments, ...metadataOnlyAttachments].sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt),
    ),
  } satisfies ConciergeIntakeDetails;
}
