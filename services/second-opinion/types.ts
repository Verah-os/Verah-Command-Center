export const SECOND_OPINION_DECISIONS = ["accepted", "declined"] as const;
export type SecondOpinionDecision = (typeof SECOND_OPINION_DECISIONS)[number];

export const SECOND_OPINION_OUTCOMES = [
  "supports_scope",
  "questions_scope",
  "professional_assessment_required",
] as const;
export type SecondOpinionOutcome = (typeof SECOND_OPINION_OUTCOMES)[number];

export const VEHICLE_MOVEMENT_GUIDANCE = [
  "do_not_move",
  "tow_recommended",
  "professional_assessment_required",
] as const;
export type VehicleMovementGuidance =
  (typeof VEHICLE_MOVEMENT_GUIDANCE)[number];

export type SecondOpinionCase = {
  request_id: string;
  revision_id: string;
  status: "requested" | "accepted" | "declined" | "result_submitted";
  timeline: Array<{
    event_type: string;
    result_available?: boolean;
    result_outcome?: SecondOpinionOutcome | null;
    note?: string | null;
    created_at: string;
  }>;
  vehicle_movement: VehicleMovementProjection | null;
};

export type VehicleMovementProjection = {
  guidance_id?: string;
  revision_id?: string;
  guidance_code: VehicleMovementGuidance;
  message: string;
  human_confirmed_at: string;
};
