import { getCustomerMetrics } from "@/services/customer-crm/service";
import { CustomerMetrics } from "./panels";

export async function CustomerDashboardMetrics() {
  return <CustomerMetrics metrics={await getCustomerMetrics()} />;
}
