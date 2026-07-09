import Link from "next/link";
import { WorkOrderList } from "@/modules/work-orders/components/work-order-list";
import type { WorkOrder } from "@/types/work-order";

export function WorkOrdersModule({ workOrders }: { workOrders: WorkOrder[] }) {
  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Codex</p>
          <h1 className="text-2xl font-semibold">Work Orders</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Operational task layer for VERAH execution, agent handoffs and future automation.
          </p>
        </div>
        <Link
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
          href="/work-orders/new"
        >
          New Work Order
        </Link>
      </section>
      <WorkOrderList workOrders={workOrders} />
    </div>
  );
}
