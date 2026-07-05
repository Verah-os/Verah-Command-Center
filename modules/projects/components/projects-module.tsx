import { ModulePage } from "@/modules/shared/module-page";
import { getModule } from "@/modules/registry";

export function ProjectsModule() {
  return <ModulePage module={getModule("projects")!} />;
}
