import { RecentExecutions } from "@/modules/ai-runtime/components/recent-executions";
import { RegisteredAgents } from "@/modules/ai-runtime/components/registered-agents";
import { RuntimeSummary } from "@/modules/ai-runtime/components/runtime-summary";
import type { RuntimeMonitor } from "@/services/ai-runtime";

export function AiRuntimeModule({ monitor }: { monitor: RuntimeMonitor }) {
  return (
    <div className="space-y-5">
      <section>
        <p className="text-sm text-muted-foreground">VERAH OS</p>
        <h1 className="text-2xl font-semibold">AI Runtime</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Read-only operational view of registered agents and structured Runtime executions.
        </p>
      </section>
      <RuntimeSummary summary={monitor.summary} />
      <RegisteredAgents agents={monitor.agents} />
      <RecentExecutions executions={monitor.recentExecutions} />
    </div>
  );
}
