import { notFound } from "next/navigation";
import { DispatcherJobDetail } from "@/modules/dispatcher/components/dispatcher-job-detail";
import { getDispatcherJobById } from "@/services/dispatcher";
import { getWorkOrderById } from "@/services/work-orders";

export const dynamic = "force-dynamic";

export default async function DispatcherJobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getDispatcherJobById(id);

  if (!job) {
    notFound();
  }

  const workOrder = await getWorkOrderById(job.workOrderId);

  return <DispatcherJobDetail job={job} workOrder={workOrder} />;
}
