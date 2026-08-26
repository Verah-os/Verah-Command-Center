import type { Metadata } from "next";
import { CustomerPilotDemo } from "@/components/customer/customer-pilot-demo";

export const metadata: Metadata = {
  title: "Jornada Cliente Demo | VERAH",
  description: "Experiência cliente demonstrativa com dados 100% sintéticos.",
};

export default function CustomerPilotDemoPage() {
  return <CustomerPilotDemo />;
}
