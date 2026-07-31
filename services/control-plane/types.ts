export const CONTROL_PLANE_STATES = [
  "queued",
  "planning",
  "waiting_approval",
  "implementing",
  "testing",
  "fixing",
  "pr_open",
  "blocked",
  "completed",
  "failed",
  "cancelled",
] as const;

export type ControlPlaneState = (typeof CONTROL_PLANE_STATES)[number];

export type ParsedIssue = {
  repository: string;
  number: number;
  title: string;
  updatedAt: string;
  objective: string;
  scope: string[];
  acceptanceCriteria: string[];
  constraints: string[];
};

export type SyntheticIssueEvent = {
  eventId: string;
  action: "opened" | "edited" | "labeled";
  repository: string;
  issue: {
    number: number;
    title: string;
    body: string;
    updatedAt: string;
  };
  approval?: {
    decision: "approved" | "rejected";
    maintainer: string;
    decidedAt: string;
  };
};

export type DryRunPlan = {
  objective: string;
  steps: string[];
  acceptanceCriteria: string[];
  constraints: string[];
  risks: string[];
  gates: string[];
};

export type DryRunCommand = {
  deliveryId: string;
  repository: string;
  issueNumber: number;
  issueUpdatedAt: string;
  title: string;
  bodySha256: string;
  maintainer: string | null;
  approved: boolean;
  approvalEvidenceSha256: string | null;
  plan: DryRunPlan | null;
  budget: {
    maxDurationMs: number;
    maxSteps: number;
    maxCostMicrounits: number;
    estimatedSteps: number;
    estimatedCostMicrounits: number;
  };
};

export type DryRunReport = {
  status:
    | "completed"
    | "waiting_approval"
    | "blocked"
    | "duplicate"
    | "ignored_out_of_order";
  workItemId: string;
  executionRunId: string | null;
  state: ControlPlaneState;
  resumed: boolean;
  plan: DryRunPlan | null;
  budget: {
    maxDurationMs: number;
    maxSteps: number;
    maxCostMicrounits: number;
    estimatedSteps: number;
    estimatedCostMicrounits: number;
  };
  repositoryMutations: [];
  productionMutations: [];
  externalEffects: [];
};

export type DryRunPersistence = {
  process(command: DryRunCommand): Promise<DryRunReport>;
};

