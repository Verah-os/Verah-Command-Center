import { EmptyState } from "@/components/state/empty-state";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatPercentage, formatRuntimeDate } from "@/modules/ai-runtime/components/runtime-format";
import type { RegisteredRuntimeAgent } from "@/services/ai-runtime";

export function RegisteredAgents({ agents }: { agents: RegisteredRuntimeAgent[] }) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold">Registered Agents</h2>
      </CardHeader>
      <CardContent>
        {agents.length === 0 ? (
          <EmptyState title="No registered agents" description="No Runtime or AI Team agents are available." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Agent ID</th>
                  <th className="py-2 pr-3 font-medium">Provider</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Capabilities</th>
                  <th className="py-2 pr-3 font-medium">Last execution</th>
                  <th className="py-2 pr-3 font-medium">Executions</th>
                  <th className="py-2 font-medium">Error rate</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr key={agent.agentId} className="border-b border-border last:border-0">
                    <td className="py-3 pr-3 font-medium">{agent.agentId}</td>
                    <td className="py-3 pr-3">{agent.provider}</td>
                    <td className="py-3 pr-3">{agent.status}</td>
                    <td className="py-3 pr-3">{agent.capabilities.join(", ") || "Not available"}</td>
                    <td className="py-3 pr-3">{formatRuntimeDate(agent.lastExecutionAt)}</td>
                    <td className="py-3 pr-3">{agent.totalExecutions}</td>
                    <td className="py-3">{formatPercentage(agent.errorRate)}</td>
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
