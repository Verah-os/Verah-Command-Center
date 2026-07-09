export type WorkOrderStatus = "Backlog" | "In Progress" | "Review" | "Done" | "Blocked";

export type WorkOrderPriority = "Low" | "Medium" | "High" | "Critical";

export type WorkOrderOrigin = "Manual" | "GitHub" | "Dispatcher" | "AI";

export type WorkOrder = {
  id: string;
  title: string;
  description: string;
  category: string;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  owner: string;
  origin: WorkOrderOrigin;
  createdAt: string;
  updatedAt: string;
};
