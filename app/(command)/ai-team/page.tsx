import { AiTeamModule } from "@/modules/ai-team/components/ai-team-module";
import { listAiAgents } from "@/services/ai-team";

export const dynamic = "force-dynamic";

export default async function AiTeamPage() {
  const agents = await listAiAgents();

  return <AiTeamModule agents={agents} />;
}
