import { ModulePage } from "@/modules/shared/module-page";
import { getModule } from "@/modules/registry";

export function SettingsModule() {
  return <ModulePage module={getModule("settings")!} />;
}
