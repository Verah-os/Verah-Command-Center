import Link from "next/link";
import type { Route } from "next";
import { EmptyState } from "@/components/state/empty-state";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { WorkOrderPriorityText, WorkOrderStatusText } from "@/modules/work-orders/components/work-order-status";
import type { WorkOrder } from "@/types/work-order";

function formatDate(value: string) {
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00`);

  return new Intl.DateTimeFormat("pt-BR").format(date);
}

export function WorkOrderList({ workOrders }: { workOrders: WorkOrder[] }) {
  if (workOrders.length === 0) {
    return (
      <EmptyState
        title="Work Orders sem dados"
        description="Nenhuma Work Order encontrada no Supabase. Execute o seed inicial para carregar os dados base."
      />
    );
  }

  return (
    <section className="grid gap-3">
      {workOrders.map((workOrder) => (
        <Link key={workOrder.id} href={`/work-orders/${workOrder.id}` as Route}>
          <Card className="transition-colors hover:bg-muted">
            <CardHeader>
              <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-primary">{workOrder.id}</p>
                  <h2 className="text-lg font-semibold">{workOrder.title}</h2>
                </div>
                <p className="text-sm text-muted-foreground">{workOrder.category}</p>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 text-sm md:grid-cols-3 lg:grid-cols-6">
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <WorkOrderStatusText status={workOrder.status} />
                </div>
                <div>
                  <p className="text-muted-foreground">Owner</p>
                  <p className="font-medium">{workOrder.owner}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Priority</p>
                  <WorkOrderPriorityText priority={workOrder.priority} />
                </div>
                <div>
                  <p className="text-muted-foreground">Origin</p>
                  <p className="font-medium">{workOrder.origin}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Created</p>
                  <p className="font-medium">{formatDate(workOrder.createdAt)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Updated</p>
                  <p className="font-medium">{formatDate(workOrder.updatedAt)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </section>
  );
}
