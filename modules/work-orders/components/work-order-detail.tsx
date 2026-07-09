import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { WorkOrderPriorityText, WorkOrderStatusText } from "@/modules/work-orders/components/work-order-status";
import type { WorkOrder } from "@/types/work-order";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T00:00:00`));
}

export function WorkOrderDetail({ workOrder }: { workOrder: WorkOrder }) {
  return (
    <div className="space-y-5">
      <section>
        <p className="text-sm font-semibold text-primary">{workOrder.id}</p>
        <h1 className="text-2xl font-semibold">{workOrder.title}</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{workOrder.description}</p>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardHeader>
            <p className="text-sm text-muted-foreground">Status</p>
          </CardHeader>
          <CardContent>
            <WorkOrderStatusText status={workOrder.status} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <p className="text-sm text-muted-foreground">Priority</p>
          </CardHeader>
          <CardContent>
            <WorkOrderPriorityText priority={workOrder.priority} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <p className="text-sm text-muted-foreground">Owner</p>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{workOrder.owner}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <p className="text-sm text-muted-foreground">Created</p>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{formatDate(workOrder.createdAt)}</p>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">Historico</h2>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Historico operacional preparado para eventos futuros.</p>
        </CardContent>
      </Card>
    </div>
  );
}
