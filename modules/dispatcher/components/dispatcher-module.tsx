import { ModulePage } from "@/modules/shared/module-page";
import { getModule } from "@/modules/registry";

export function DispatcherModule() {
  return <ModulePage module={getModule("dispatcher")!} />;
}
