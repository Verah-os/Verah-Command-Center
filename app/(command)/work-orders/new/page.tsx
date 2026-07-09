import { WorkOrderForm } from "@/modules/work-orders/components/work-order-form";

export const dynamic = "force-dynamic";

export default async function NewWorkOrderPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return <WorkOrderForm error={error} />;
}
