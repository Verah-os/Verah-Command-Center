import { DispatcherModule } from "@/modules/dispatcher/components/dispatcher-module";
import { listDispatcherJobs } from "@/services/dispatcher";

export const dynamic = "force-dynamic";

export default async function DispatcherPage({
  searchParams
}: {
  searchParams: Promise<{ message?: string; status?: "success" | "error" }>;
}) {
  const params = await searchParams;
  const jobs = await listDispatcherJobs();

  return <DispatcherModule feedback={{ message: params.message, status: params.status }} jobs={jobs} />;
}
