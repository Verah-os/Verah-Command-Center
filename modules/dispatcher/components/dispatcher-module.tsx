import { Button } from "@/components/ui/button";
import { DispatcherJobList } from "@/modules/dispatcher/components/dispatcher-job-list";
import { runDispatcherEngineAction } from "@/services/dispatcher/actions";
import type { DispatcherJob } from "@/types/dispatcher-job";

type DispatcherFeedback = {
  status?: "success" | "error";
  message?: string;
};

export function DispatcherModule({ feedback, jobs }: { feedback?: DispatcherFeedback; jobs: DispatcherJob[] }) {
  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Dispatcher</p>
          <h1 className="text-2xl font-semibold">Dispatcher Engine</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Infraestrutura de distribuicao de Work Orders para agentes. Esta versao executa jobs simulados sem chamar IA.
          </p>
        </div>
        <form action={runDispatcherEngineAction}>
          <Button type="submit">Run next queued job</Button>
        </form>
      </section>

      {feedback?.status && feedback.message ? (
        <div
          className={
            feedback.status === "success"
              ? "rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
              : "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          }
        >
          {feedback.message}
        </div>
      ) : null}

      <DispatcherJobList jobs={jobs} status="queued" />
      <DispatcherJobList jobs={jobs} status="running" />
      <DispatcherJobList jobs={jobs} status="failed" />
      <DispatcherJobList jobs={jobs} status="completed" />
    </div>
  );
}
