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

export const CONTROL_PLANE_GATES = ["AUTO", "AUTO_PR", "HUMAN"] as const;
export type ControlPlaneGate = (typeof CONTROL_PLANE_GATES)[number];

export type AgentRole = {
  id: string;
  name: string;
  capabilities: readonly string[];
  reviewStatus: "internal-approved" | "pending-review";
};

export type ExecutorAvailability =
  | "available"
  | "busy"
  | "unavailable"
  | "rate_limited";

export type ModelRoute = {
  provider: string;
  model: string;
  source: "internal" | "omniroute";
  rationale: string;
};

export type AgentTask = {
  issueKey: string;
  idempotencyKey: string;
  title: string;
  roleId: string;
  kind: string;
  effects?: readonly string[];
  contextRefs?: readonly string[];
};

export type AgentExecutionRequest = {
  task: AgentTask;
  role: AgentRole;
  modelRoute: ModelRoute;
  context: readonly string[];
  dryRun: true;
};

export type AgentExecutionResult = {
  status: "completed" | "failed";
  handoff?: string;
  errorCode?: string;
  costMicrounits?: number;
  externalEffects?: readonly string[];
};

export type AgentExecutor = {
  id: string;
  availability(): Promise<ExecutorAvailability>;
  execute(request: AgentExecutionRequest): Promise<AgentExecutionResult>;
};

export type ModelRouter = {
  route(task: AgentTask, role: AgentRole): Promise<ModelRoute>;
};

export type AgentMemory = {
  loadContext(task: AgentTask): Promise<readonly string[]>;
};

export type AgentRunStatus =
  | "blocked"
  | "completed"
  | "failed_recoverable";

export type AgentRun = {
  id: string;
  issueKey: string;
  idempotencyKey: string;
  roleId: string;
  executorId: string;
  modelRoute: ModelRoute | null;
  gate: ControlPlaneGate;
  status: AgentRunStatus;
  attempt: number;
  dryRun: true;
  startedAt: string;
  completedAt: string;
  costMicrounits?: number;
  handoff?: string;
  blocker?: string;
  deduplicated: boolean;
  externalEffects: readonly [];
};

export type AgentLease = {
  id: string;
  issueKey: string;
  owner: string;
  runId: string;
  acquiredAt: string;
  expiresAt: string;
};

export type LeaseClaim = {
  acquired: boolean;
  lease: AgentLease | null;
  recoveredLeaseId: string | null;
};

export type ControlPlaneAuditEvent = {
  type: string;
  issueKey: string;
  runId: string;
  at: string;
  details: Record<string, unknown>;
};
