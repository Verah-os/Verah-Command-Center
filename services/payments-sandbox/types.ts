export type PaymentStatus =
  | "requires_approval"
  | "confirmed"
  | "failed"
  | "blocked"
  | "refunded"
  | "reversed";

export type PaymentActor = "customer" | "concierge" | "verah_agent" | "system";

export type PaymentBreakdown = {
  serviceAmount: number;
  verahFee: number;
  customerTotal: number;
};

export type QuoteApprovalSnapshot = {
  approved: boolean;
  quoteId: string;
  quoteVersion: string;
  approvedTotal: number;
};

export type SandboxPaymentCommand = {
  serviceRequestId: string;
  quoteId: string;
  quoteVersion: string;
  idempotencyKey: string;
  actor: PaymentActor;
  amounts: PaymentBreakdown;
  approval: QuoteApprovalSnapshot;
  method: {
    token: string;
    brand: string;
    last4: string;
  };
};

export type SandboxProvider = {
  id: string;
  environment: "sandbox";
  authorize(input: {
    operationId: string;
    amount: number;
    idempotencyKey: string;
    methodToken: string;
  }): Promise<
    | { status: "confirmed"; providerReference: string }
    | { status: "failed"; reason: "provider_unavailable" | "provider_declined" }
  >;
};

export type LedgerEntry = {
  sequence: number;
  occurredAt: string;
  code:
    | "intent_created"
    | "approval_required"
    | "approval_verified"
    | "approval_stale"
    | "actor_blocked"
    | "payment_confirmed"
    | "payment_failed"
    | "refund_recorded"
    | "reversal_recorded";
  status: PaymentStatus;
};

export type PaymentOperation = {
  id: string;
  serviceRequestId: string;
  quoteId: string;
  quoteVersion: string;
  idempotencyKey: string;
  status: PaymentStatus;
  amounts: PaymentBreakdown;
  method: { brand: string; last4: string };
  providerReference: string | null;
  failureReason: string | null;
  ledger: LedgerEntry[];
};

export type PaymentAuditEvent = {
  operationId: string;
  serviceRequestId: string;
  quoteId: string;
  status: PaymentStatus;
  code: LedgerEntry["code"];
  method: { brand: string; last4: string };
};
