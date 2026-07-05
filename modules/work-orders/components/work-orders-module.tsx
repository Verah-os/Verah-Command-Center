import { ModulePage } from "@/modules/shared/module-page";
import { getModule } from "@/modules/registry";

export function WorkOrdersModule() {
  return <ModulePage module={getModule("work-orders")!} />;
}
