import { ModulePage } from "@/modules/shared/module-page";
import { getModule } from "@/modules/registry";

export function AnalyticsModule() {
  return <ModulePage module={getModule("analytics")!} />;
}
