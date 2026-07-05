import { ModulePage } from "@/modules/shared/module-page";
import { getModule } from "@/modules/registry";

export function AutomationModule() {
  return <ModulePage module={getModule("automation")!} />;
}
