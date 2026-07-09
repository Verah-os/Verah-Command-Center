import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { DispatcherJob } from "@/types/dispatcher-job";
import type { WorkOrder } from "@/types/work-order";

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

export function DispatcherJobDetail({ job, workOrder }: { job: DispatcherJob; workOrder: WorkOrder | null }) {
  const timeline = [
    { label: "Created", value: job.createdAt },
    { label: "Started", value: job.startedAt },
    { label: "Finished", value: job.finishedAt }
  ];

  return (
    <div className="space-y-5">
      <section>
        <p className="text-sm text-muted-foreground">Dispatcher Job</p>
        <h1 className="text-2xl font-semibold">{job.id}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Status: {job.status}</p>
      </section>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Resumo</h2>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
            <div>
              <p className="text-muted-foreground">Job ID</p>
              <p className="font-medium">{job.id}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Work Order</p>
              <Link className="font-medium text-primary" href={`/work-orders/${job.workOrderId}`}>
                {workOrder?.title ?? job.workOrderId}
              </Link>
            </div>
            <div>
              <p className="text-muted-foreground">Agente</p>
              <p className="font-medium">{job.assignedAgent ?? job.targetAgent}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Status</p>
              <p className="font-medium">{job.status}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Timeline</h2>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 text-sm md:grid-cols-3">
            {timeline.map((item) => (
              <div key={item.label}>
                <p className="text-muted-foreground">{item.label}</p>
                <p className="font-medium">{formatDate(item.value)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Logs</h2>
        </CardHeader>
        <CardContent>
          {job.logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum log registrado.</p>
          ) : (
            <div className="grid gap-3 text-sm">
              {job.logs.map((log, index) => (
                <div key={`${log.createdAt}-${index}`} className="border-b border-border pb-3 last:border-0 last:pb-0">
                  <p className="font-medium">{log.message}</p>
                  <p className="text-muted-foreground">{formatDate(log.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
