import { notFound } from "next/navigation";
import { WorkOrderDetail } from "@/modules/work-orders/components/work-order-detail";
import { getWorkOrderById } from "@/services/work-orders";

export const dynamic = "force-dynamic";

export default async function WorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workOrder = await getWorkOrderById(id);

  if (!workOrder) {
    notFound();
  }

  return <WorkOrderDetail workOrder={workOrder} />;
}
