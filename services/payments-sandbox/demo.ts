import { customerPilotDemo } from "../../lib/customer-pilot-demo.ts";
import type { PaymentActor, SandboxPaymentCommand } from "./types.ts";

export function buildCustomerPilotPaymentCommand({
  approved,
  actor = "customer",
  idempotencyKey = "customer-pilot-payment-v1",
}: {
  approved: boolean;
  actor?: PaymentActor;
  idempotencyKey?: string;
}): SandboxPaymentCommand {
  const quote = customerPilotDemo.quote;
  return {
    serviceRequestId: customerPilotDemo.id,
    quoteId: quote.id,
    quoteVersion: quote.version,
    idempotencyKey,
    actor,
    amounts: {
      serviceAmount: quote.serviceAmount * 100,
      verahFee: quote.verahFee * 100,
      customerTotal: quote.total * 100,
    },
    approval: {
      approved,
      quoteId: quote.id,
      quoteVersion: quote.version,
      approvedTotal: quote.total * 100,
    },
    method: {
      token: "sandbox_pm_visa_4821",
      brand: "Visa",
      last4: "4821",
    },
  };
}
