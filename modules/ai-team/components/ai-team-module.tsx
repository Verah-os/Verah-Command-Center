import { ModulePage } from "@/modules/shared/module-page";
import { getModule } from "@/modules/registry";

export function AiTeamModule() {
  return <ModulePage module={getModule("ai-team")!} />;
}
