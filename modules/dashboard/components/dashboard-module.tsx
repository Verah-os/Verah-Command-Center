import { ModulePage } from "@/modules/shared/module-page";
import { getModule } from "@/modules/registry";

export function DashboardModule() {
  return <ModulePage module={getModule("dashboard")!} />;
}
