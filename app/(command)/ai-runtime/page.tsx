import { AiRuntimeModule } from "@/modules/ai-runtime/components/ai-runtime-module";
import { getRuntimeMonitor } from "@/services/ai-runtime";

export const dynamic = "force-dynamic";

export default async function AiRuntimePage() {
  const monitor = await getRuntimeMonitor();

  return <AiRuntimeModule monitor={monitor} />;
}
