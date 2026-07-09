import Link from "next/link";
import { EmptyState } from "@/components/state/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  markDispatcherJobCompletedAction,
  markDispatcherJobFailedAction,
  retryFailedDispatcherJobAction
} from "@/services/dispatcher/actions";
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

function JobActionForm({ action, children, jobId }: { action: (formData: FormData) => void; children: string; jobId: string }) {
  return (
    <form action={action}>
      <input name="jobId" type="hidden" value={jobId} />
      <Button type="submit" variant="secondary">
        {children}
      </Button>
    </form>
  );
}

function DispatcherJobActions({ job }: { job: DispatcherJob }) {
  return (
    <div className="flex flex-wrap gap-2 pt-4">
      {job.status === "failed" ? (
        <JobActionForm action={retryFailedDispatcherJobAction} jobId={job.id}>
          Retry failed job
        </JobActionForm>
      ) : null}

      {job.status !== "completed" ? (
        <JobActionForm action={markDispatcherJobCompletedAction} jobId={job.id}>
          Mark completed
        </JobActionForm>
      ) : null}

      {job.status === "queued" || job.status === "running" ? (
        <JobActionForm action={markDispatcherJobFailedAction} jobId={job.id}>
          Mark failed
        </JobActionForm>
      ) : null}
    </div>
  );
}

function DispatcherJobCard({ job }: { job: DispatcherJob }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
          <div>
            <Link className="text-sm font-semibold text-primary" href={`/dispatcher/${job.id}`}>
              {job.id}
            </Link>
            <h3 className="text-base font-semibold">{job.workOrderId}</h3>
          </div>
          <p className="text-sm text-muted-foreground">{job.status}</p>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 text-sm md:grid-cols-5">
          <div>
            <p className="text-muted-foreground">Work Order</p>
            <p className="font-medium">{job.workOrderId}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Agente</p>
            <p className="font-medium">{job.assignedAgent ?? job.targetAgent}</p>
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
        <DispatcherJobActions job={job} />
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
