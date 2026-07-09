import { EmptyState } from "@/components/state/empty-state";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { DispatcherJob, DispatcherJobStatus } from "@/types/dispatcher-job";

const sectionLabels: Record<DispatcherJobStatus, string> = {
  queued: "Fila",
  running: "Jobs executando",
  completed: "Jobs concluidos",
  failed: "Jobs com falha"
};

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function DispatcherJobCard({ job }: { job: DispatcherJob }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-semibold text-primary">{job.id}</p>
            <h3 className="text-base font-semibold">{job.workOrderId}</h3>
          </div>
          <p className="text-sm text-muted-foreground">{job.status}</p>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 text-sm md:grid-cols-4">
          <div>
            <p className="text-muted-foreground">Work Order</p>
            <p className="font-medium">{job.workOrderId}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Status</p>
            <p className="font-medium">{job.status}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Created At</p>
            <p className="font-medium">{formatDate(job.createdAt)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Updated At</p>
            <p className="font-medium">{formatDate(job.updatedAt)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function DispatcherJobList({ jobs, status }: { jobs: DispatcherJob[]; status: DispatcherJobStatus }) {
  const filteredJobs = jobs.filter((job) => job.status === status);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{sectionLabels[status]}</h2>
        <p className="text-sm text-muted-foreground">{filteredJobs.length} jobs</p>
      </div>

      {filteredJobs.length === 0 ? (
        <EmptyState
          title={`${sectionLabels[status]} sem dados`}
          description="Nenhum job do Dispatcher encontrado nesta etapa."
        />
      ) : (
        <div className="grid gap-3">
          {filteredJobs.map((job) => (
            <DispatcherJobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </section>
  );
}
