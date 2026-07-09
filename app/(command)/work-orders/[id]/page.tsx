import { notFound } from "next/navigation";
import { WorkOrderDetail } from "@/modules/work-orders/components/work-order-detail";
import { getWorkOrderById, listWorkOrders } from "@/services/work-orders";

export async function generateStaticParams() {
  const workOrders = await listWorkOrders();

  return workOrders.map((workOrder) => ({
    id: workOrder.id
  }));
}

export default async function WorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workOrder = await getWorkOrderById(id);

  if (!workOrder) {
    notFound();
  }

  return <WorkOrderDetail workOrder={workOrder} />;
}
