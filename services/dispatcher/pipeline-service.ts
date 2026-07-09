import type { DispatcherJobStatus } from "@/types/dispatcher-job";
import type { WorkOrder } from "@/types/work-order";

export const dispatcherPipelineStages = ["queued", "running", "completed"] as const;

type DispatcherPipelineStage = (typeof dispatcherPipelineStages)[number];

export type DispatcherJobInput = {
  workOrderId: string;
  targetAgent: string;
  status: DispatcherPipelineStage;
  payload: Record<string, unknown>;
};

export function buildDispatcherJobInput(workOrder: WorkOrder): DispatcherJobInput {
  return {
    workOrderId: workOrder.id,
    targetAgent: workOrder.owner || "dispatcher",
    status: "queued",
    payload: {
      workOrderId: workOrder.id,
      title: workOrder.title,
      category: workOrder.category,
      origin: workOrder.origin
    }
  };
}

export function getNextDispatcherStatus(status: DispatcherJobStatus): DispatcherPipelineStage | null {
  if (status === "queued") {
    return "running";
  }

  if (status === "running") {
    return "completed";
  }

  return null;
}

export function isDispatcherPipelineStatus(status: DispatcherJobStatus): status is DispatcherPipelineStage {
  return dispatcherPipelineStages.includes(status as DispatcherPipelineStage);
}
