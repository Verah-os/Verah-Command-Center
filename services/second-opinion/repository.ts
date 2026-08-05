import "server-only";

import { createSupabaseServerClient } from "@/services/supabase/server";
import {
  buildSecondOpinionRequestInput,
  buildSecondOpinionResponseInput,
  buildSecondOpinionResultInput,
  buildVehicleMovementGuidanceInput,
} from "./input";
import type {
  SecondOpinionCase,
  SecondOpinionDecision,
  SecondOpinionOutcome,
  VehicleMovementGuidance,
  VehicleMovementProjection,
} from "./types";

export async function requestSecondOpinion(input: {
  revisionId: string;
  reviewProviderId: string;
  eligibilityAssessmentId: string;
  eligibilityJustification: string;
  requestReason: string;
  idempotencyKey: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(
    "request_second_opinion",
    buildSecondOpinionRequestInput(input),
  );
  if (error) throw new Error(`second_opinion_request_failed:${error.code}`);
  return data as string;
}

export async function respondToSecondOpinion(input: {
  requestId: string;
  decision: SecondOpinionDecision;
  note?: string;
  idempotencyKey: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(
    "respond_to_second_opinion",
    buildSecondOpinionResponseInput(input),
  );
  if (error) throw new Error(`second_opinion_response_failed:${error.code}`);
  return data as string;
}

export async function submitSecondOpinionResult(input: {
  requestId: string;
  outcome: SecondOpinionOutcome;
  summary: string;
  idempotencyKey: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(
    "submit_second_opinion_result",
    buildSecondOpinionResultInput(input),
  );
  if (error) throw new Error(`second_opinion_result_failed:${error.code}`);
  return data as string;
}

export async function recordVehicleMovementGuidance(input: {
  revisionId: string;
  secondOpinionRequestId?: string;
  guidance: VehicleMovementGuidance;
  internalReason: string;
  idempotencyKey: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(
    "record_vehicle_movement_guidance",
    buildVehicleMovementGuidanceInput(input),
  );
  if (error) throw new Error(`vehicle_movement_guidance_failed:${error.code}`);
  return data as string;
}

export async function getSecondOpinionCase(requestId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_second_opinion_case", {
    p_request_id: requestId,
  });
  if (error) throw new Error(`second_opinion_case_failed:${error.code}`);
  return data as SecondOpinionCase;
}

export async function getVehicleMovementGuidance(serviceRequestId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_vehicle_movement_guidance", {
    p_service_request_id: serviceRequestId,
  });
  if (error) throw new Error(`vehicle_movement_guidance_read_failed:${error.code}`);
  return data as VehicleMovementProjection;
}
