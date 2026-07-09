import { WorkOrdersModule } from "@/modules/work-orders/components/work-orders-module";
import { listWorkOrders } from "@/services/work-orders";

export default async function WorkOrdersPage() {
  const workOrders = await listWorkOrders();

  return <WorkOrdersModule workOrders={workOrders} />;
}
