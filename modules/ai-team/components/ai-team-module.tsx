import { AiAgentList } from "@/modules/ai-team/components/ai-agent-list";
import type { AiAgent } from "@/types/ai-agent";

export function AiTeamModule({ agents }: { agents: AiAgent[] }) {
  return (
    <div className="space-y-5">
      <section>
        <p className="text-sm text-muted-foreground">VERAH OS</p>
        <h1 className="text-2xl font-semibold">AI Team</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Registro operacional dos agentes da VERAH. Esta versao apenas visualiza agentes e capacidades.
        </p>
      </section>
      <AiAgentList agents={agents} />
    </div>
  );
}
