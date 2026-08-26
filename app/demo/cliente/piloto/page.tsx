import type { Metadata } from "next";
import { CustomerPilotDemo } from "@/components/customer/customer-pilot-demo";
import { customerPilotDemo } from "@/lib/customer-pilot-demo";
import { runVerahAgentDemo } from "@/services/verah-agent";

export const metadata: Metadata = {
  title: "Jornada Cliente Demo | VERAH",
  description: "Experiência cliente demonstrativa com dados 100% sintéticos.",
};

export default async function CustomerPilotDemoPage() {
  const result = await runVerahAgentDemo({
    message: customerPilotDemo.report,
    vehicleReference: customerPilotDemo.vehicle.id,
  });
  const agent = {
    knownFacts: result.knownFacts,
    evidence: result.evidence,
    inference: result.inference,
    missingInformation: result.missingInformation,
    questions: result.questions,
    riskSignals: result.riskSignals,
    explanation: result.explanation,
    nextStep: result.nextStep,
    offer: result.offer,
    handoff: result.handoff,
  };
  return <CustomerPilotDemo agent={agent} />;
}
