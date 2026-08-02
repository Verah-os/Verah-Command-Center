import "server-only";

import { createSupabaseAdminClient } from "@/services/supabase/admin";
import type { IntakeAssessment, IntakeContext, IntakeTransition } from "./types";

function first<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function prepareIntakeContext(messageId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("prepare_intelligent_intake", {
    p_message_id: messageId,
  });
  if (error) throw new Error(`intake_prepare_failed:${error.code}`);
  return first(data) as IntakeContext;
}

export async function persistIntakeTransition(input: {
  context: IntakeContext;
  transition: IntakeTransition;
  assessment: IntakeAssessment | null;
}) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("apply_intelligent_intake_transition", {
    p_message_id: input.context.messageId,
    p_intake_session_id: input.context.sessionId,
    p_expected_status: input.context.status,
    p_expected_step: input.context.currentStep,
    p_next_status: input.transition.nextStatus,
    p_next_step: input.transition.nextStep,
    p_collected_data: input.transition.collectedData,
    p_response_body: input.transition.response,
    p_vehicle_id: input.transition.vehicleId ?? input.context.vehicleId,
    p_customer_display_name: input.transition.customerDisplayName ?? null,
    p_assessment: input.assessment,
    p_complete: input.transition.complete,
  });
  if (error) throw new Error(`intake_transition_failed:${error.code}`);
  return first(data) as {
    status: string;
    intakeSessionId: string;
    serviceRequestId: string | null;
    vehicleId: string | null;
  };
}

