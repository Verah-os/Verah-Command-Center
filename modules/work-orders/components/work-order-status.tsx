import type { WorkOrderPriority, WorkOrderStatus } from "@/types/work-order";

const statusLabels: Record<WorkOrderStatus, string> = {
  Backlog: "Backlog",
  "In Progress": "In Progress",
  Review: "Review",
  Done: "Done",
  Blocked: "Blocked"
};

const priorityLabels: Record<WorkOrderPriority, string> = {
  Low: "Low",
  Medium: "Medium",
  High: "High",
  Critical: "Critical"
};

export function WorkOrderStatusText({ status }: { status: WorkOrderStatus }) {
  return <span className="font-medium">{statusLabels[status]}</span>;
}

export function WorkOrderPriorityText({ priority }: { priority: WorkOrderPriority }) {
  return <span className="font-medium">{priorityLabels[priority]}</span>;
}
