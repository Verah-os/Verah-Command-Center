import Link from "next/link";
import { EmptyState } from "@/components/state/empty-state";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatDuration, formatRuntimeDate } from "@/modules/ai-runtime/components/runtime-format";
import type { RuntimeExecution } from "@/services/ai-runtime";

export function RecentExecutions({ executions }: { executions: RuntimeExecution[] }) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold">Recent Runtime Executions</h2>
      </CardHeader>
      <CardContent>
        {executions.length === 0 ? (
          <EmptyState
            title="No Runtime executions"
            description="Run a compatible Dispatcher job with AI Runtime to create the first structured execution log."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Execution ID</th>
                  <th className="py-2 pr-3 font-medium">Dispatcher job</th>
                  <th className="py-2 pr-3 font-medium">Work order</th>
                  <th className="py-2 pr-3 font-medium">Agent ID</th>
                  <th className="py-2 pr-3 font-medium">Provider</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Duration</th>
                  <th className="py-2 font-medium">Completed at</th>
                </tr>
              </thead>
              <tbody>
                {executions.map((execution) => (
                  <tr key={execution.executionId} className="border-b border-border last:border-0">
                    <td className="py-3 pr-3 font-medium">{execution.executionId}</td>
                    <td className="py-3 pr-3">
                      <Link className="font-medium text-primary" href={`/dispatcher/${execution.dispatcherJobId}`}>
                        {execution.dispatcherJobId}
                      </Link>
                    </td>
                    <td className="py-3 pr-3">{execution.workOrderId}</td>
                    <td className="py-3 pr-3">{execution.agentId}</td>
                    <td className="py-3 pr-3">{execution.provider}</td>
                    <td className="py-3 pr-3">{execution.status}</td>
                    <td className="py-3 pr-3">{formatDuration(execution.durationMs)}</td>
                    <td className="py-3">{formatRuntimeDate(execution.completedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
