import { notFound } from "next/navigation";
import {
  CustomerOverview,
  SourceNotice,
} from "@/components/customer-crm/panels";
import { getCustomerDetail } from "@/services/customer-crm/service";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Cliente 360° | VERAH",
  robots: { index: false, follow: false },
};
export default async function CustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getCustomerDetail(id);
  if (detail.status === "not_found") notFound();
  if (detail.status === "unavailable")
    return <SourceNotice title="Ficha da cliente indisponível" />;
  return <CustomerOverview detail={detail} />;
}
