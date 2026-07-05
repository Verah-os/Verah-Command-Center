import { Activity, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/state/empty-state";
import type { CommandModule } from "@/types/module";

export function ModulePage({ module }: { module: CommandModule }) {
  if (module.status === "empty") {
    return <EmptyState title={`${module.title} sem dados conectados`} description={module.description} />;
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <p className="text-sm text-muted-foreground">{module.owner}</p>
          <h1 className="text-2xl font-semibold">{module.title}</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{module.description}</p>
        </div>
        <Button>
          {module.primaryAction}
          <ArrowUpRight className="ml-2 size-4" />
        </Button>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {module.metrics.map((metric) => (
          <Card key={metric.label}>
            <CardHeader>
              <p className="text-sm text-muted-foreground">{metric.label}</p>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{metric.value}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-primary" />
            <h2 className="font-semibold">Operational Stream</h2>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-border p-4">
              <p className="text-sm font-medium">State</p>
              <p className="mt-1 text-sm text-muted-foreground">{module.status}</p>
            </div>
            <div className="rounded-md border border-border p-4">
              <p className="text-sm font-medium">Integration Boundary</p>
              <p className="mt-1 text-sm text-muted-foreground">Supabase Auth, GitHub API and n8n webhooks.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
