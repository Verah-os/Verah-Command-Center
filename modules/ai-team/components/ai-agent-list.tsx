import { EmptyState } from "@/components/state/empty-state";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { AiAgent } from "@/types/ai-agent";

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatCapabilities(capabilities: string[]) {
  if (capabilities.length === 0) {
    return "-";
  }

  return capabilities.join(", ");
}

export function AiAgentList({ agents }: { agents: AiAgent[] }) {
  if (agents.length === 0) {
    return (
      <EmptyState
        title="AI Team sem dados"
        description="Nenhum agente encontrado no Supabase. Execute a seed inicial do AI Team."
      />
    );
  }

  return (
    <section className="grid gap-3">
      {agents.map((agent) => (
        <Card key={agent.id}>
          <CardHeader>
            <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-semibold text-primary">{agent.provider}</p>
                <h2 className="text-lg font-semibold">{agent.name}</h2>
              </div>
              <p className="text-sm text-muted-foreground">{agent.status}</p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-5">
              <div>
                <p className="text-muted-foreground">Funcao</p>
                <p className="font-medium">{agent.role}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Provider</p>
                <p className="font-medium">{agent.provider}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Status</p>
                <p className="font-medium">{agent.status}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Capabilities</p>
                <p className="font-medium">{formatCapabilities(agent.capabilities)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Ultimo visto</p>
                <p className="font-medium">{formatDate(agent.lastSeenAt)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
