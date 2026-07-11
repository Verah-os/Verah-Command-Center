import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatDuration, formatPercentage, formatRuntimeDate } from "@/modules/ai-runtime/components/runtime-format";
import type { RuntimeSummary as RuntimeSummaryData } from "@/services/ai-runtime";

export function RuntimeSummary({ summary }: { summary: RuntimeSummaryData }) {
  const metrics = [
    ["Total executions", String(summary.totalExecutions)],
    ["Completed", String(summary.completedExecutions)],
    ["Failed", String(summary.failedExecutions)],
    ["Success rate", formatPercentage(summary.successRate)],
    ["Average duration", formatDuration(summary.averageDurationMs)],
    ["Last execution", formatRuntimeDate(summary.lastExecutionAt)]
  ];

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold">Runtime Summary</h2>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-6">
          {metrics.map(([label, value]) => (
            <div key={label}>
              <p className="text-muted-foreground">{label}</p>
              <p className="mt-1 font-semibold">{value}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
