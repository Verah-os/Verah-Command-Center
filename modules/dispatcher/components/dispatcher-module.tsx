import { DispatcherJobList } from "@/modules/dispatcher/components/dispatcher-job-list";
import type { DispatcherJob } from "@/types/dispatcher-job";

export function DispatcherModule({ jobs }: { jobs: DispatcherJob[] }) {
  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm text-muted-foreground">Dispatcher</p>
        <h1 className="text-2xl font-semibold">Dispatcher Engine</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Infraestrutura de distribuicao de Work Orders para agentes. Esta versao apenas organiza jobs e status.
        </p>
      </section>

      <DispatcherJobList jobs={jobs} status="queued" />
      <DispatcherJobList jobs={jobs} status="running" />
      <DispatcherJobList jobs={jobs} status="completed" />
    </div>
  );
}
