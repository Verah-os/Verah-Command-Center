import { ModulePage } from "@/modules/shared/module-page";
import { getModule } from "@/modules/registry";

export function AtlasModule() {
  return <ModulePage module={getModule("atlas")!} />;
}
