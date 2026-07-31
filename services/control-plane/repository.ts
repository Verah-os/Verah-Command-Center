import "server-only";

import { createSupabaseAdminClient } from "@/services/supabase/admin";

import type { DryRunCommand, DryRunPersistence, DryRunReport } from "./types.ts";

export const controlPlanePersistence: DryRunPersistence = {
  async process(command: DryRunCommand) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.rpc("process_control_plane_dry_run", {
      p_delivery_id: command.deliveryId,
      p_repository: command.repository,
      p_issue_number: command.issueNumber,
      p_issue_updated_at: command.issueUpdatedAt,
      p_title: command.title,
      p_body_sha256: command.bodySha256,
      p_maintainer_login: command.maintainer,
      p_approved: command.approved,
      p_approval_evidence_sha256: command.approvalEvidenceSha256,
      p_plan: command.plan,
      p_max_duration_ms: command.budget.maxDurationMs,
      p_max_steps: command.budget.maxSteps,
      p_max_cost_microunits: command.budget.maxCostMicrounits,
      p_estimated_steps: command.budget.estimatedSteps,
      p_estimated_cost_microunits: command.budget.estimatedCostMicrounits,
    });

    if (error) throw new Error(`control_plane_persistence_failed:${error.code}`);
    return data as unknown as DryRunReport;
  },
};

