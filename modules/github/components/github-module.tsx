import { ModulePage } from "@/modules/shared/module-page";
import { getModule } from "@/modules/registry";

export function GitHubModule() {
  return <ModulePage module={getModule("github")!} />;
}
