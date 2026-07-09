import { DispatcherModule } from "@/modules/dispatcher/components/dispatcher-module";
import { listDispatcherJobs } from "@/services/dispatcher";

export const dynamic = "force-dynamic";

export default async function DispatcherPage() {
  const jobs = await listDispatcherJobs();

  return <DispatcherModule jobs={jobs} />;
}
