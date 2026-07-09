import { WorkOrderList } from "@/modules/work-orders/components/work-order-list";
import type { WorkOrder } from "@/types/work-order";

export function WorkOrdersModule({ workOrders }: { workOrders: WorkOrder[] }) {
  return (
    <div className="space-y-5">
      <section>
        <p className="text-sm text-muted-foreground">Codex</p>
        <h1 className="text-2xl font-semibold">Work Orders</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Operational task layer for VERAH execution, agent handoffs and future automation.
        </p>
      </section>
      <WorkOrderList workOrders={workOrders} />
    </div>
  );
}
