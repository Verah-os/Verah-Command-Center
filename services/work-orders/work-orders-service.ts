import { mockWorkOrders } from "@/services/work-orders/mock-work-orders";
import type { WorkOrder, WorkOrderStatus } from "@/types/work-order";

export type WorkOrderStats = {
  total: number;
  inProgress: number;
  done: number;
  blocked: number;
};

const statusWeight: Record<WorkOrderStatus, number> = {
  "In Progress": 0,
  Review: 1,
  Blocked: 2,
  Backlog: 3,
  Done: 4
};

export async function listWorkOrders(): Promise<WorkOrder[]> {
  return [...mockWorkOrders].sort((current, next) => {
    const statusDelta = statusWeight[current.status] - statusWeight[next.status];

    if (statusDelta !== 0) {
      return statusDelta;
    }

    return new Date(next.createdAt).getTime() - new Date(current.createdAt).getTime();
  });
}

export async function getWorkOrderById(id: string): Promise<WorkOrder | null> {
  return mockWorkOrders.find((workOrder) => workOrder.id === id) ?? null;
}

export async function getWorkOrderStats(): Promise<WorkOrderStats> {
  return {
    total: mockWorkOrders.length,
    inProgress: mockWorkOrders.filter((workOrder) => workOrder.status === "In Progress").length,
    done: mockWorkOrders.filter((workOrder) => workOrder.status === "Done").length,
    blocked: mockWorkOrders.filter((workOrder) => workOrder.status === "Blocked").length
  };
}
