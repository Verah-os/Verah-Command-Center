import { env } from "@/lib/env";
import { createSupabaseServerClient } from "@/services/supabase/server";
import type { WorkOrder } from "@/types/work-order";

export type WorkOrderStats = {
  total: number;
  inProgress: number;
  done: number;
  blocked: number;
};

type WorkOrderRow = {
  id: string;
  title: string;
  description: string;
  status: WorkOrder["status"];
  priority: WorkOrder["priority"];
  owner: string;
  origin: WorkOrder["origin"];
  category: string;
  created_at: string;
  updated_at: string;
};

const workOrderColumns =
  "id,title,description,status,priority,owner,origin,category,created_at,updated_at";

function isSupabaseConfigured() {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

function toWorkOrder(row: WorkOrderRow): WorkOrder {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    owner: row.owner,
    origin: row.origin,
    category: row.category,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listWorkOrders(): Promise<WorkOrder[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("work_orders")
    .select(workOrderColumns)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load work orders", error.message);
    return [];
  }

  return ((data ?? []) as WorkOrderRow[]).map(toWorkOrder);
}

export async function getWorkOrderById(id: string): Promise<WorkOrder | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("work_orders")
    .select(workOrderColumns)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Failed to load work order", error.message);
    return null;
  }

  return data ? toWorkOrder(data as WorkOrderRow) : null;
}

export async function getWorkOrderStats(): Promise<WorkOrderStats> {
  const workOrders = await listWorkOrders();

  return {
    total: workOrders.length,
    inProgress: workOrders.filter((workOrder) => workOrder.status === "In Progress").length,
    done: workOrders.filter((workOrder) => workOrder.status === "Done").length,
    blocked: workOrders.filter((workOrder) => workOrder.status === "Blocked").length
  };
}
