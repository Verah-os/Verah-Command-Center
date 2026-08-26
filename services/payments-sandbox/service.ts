import type {
  LedgerEntry,
  PaymentActor,
  PaymentAuditEvent,
  PaymentOperation,
  PaymentStatus,
  SandboxPaymentCommand,
  SandboxProvider,
} from "./types.ts";

type ServiceOptions = {
  provider: SandboxProvider;
  enabled?: boolean;
  now?: () => string;
  onEvent?: (event: PaymentAuditEvent) => void;
};

export class SandboxPaymentService {
  private readonly operations = new Map<string, PaymentOperation>();
  private readonly inFlight = new Map<string, Promise<PaymentOperation>>();
  private readonly transitions = new Map<string, PaymentOperation>();
  private readonly provider: SandboxProvider;
  private readonly enabled: boolean;
  private readonly now: () => string;
  private readonly onEvent: (event: PaymentAuditEvent) => void;

  constructor({ provider, enabled = true, now = () => new Date().toISOString(), onEvent = () => undefined }: ServiceOptions) {
    if (provider.environment !== "sandbox") throw new Error("payment_provider_must_be_sandbox");
    this.provider = provider;
    this.enabled = enabled;
    this.now = now;
    this.onEvent = onEvent;
  }

  process(command: SandboxPaymentCommand): Promise<PaymentOperation> {
    validateCommand(command);
    const key = command.idempotencyKey.trim();
    const existing = this.operations.get(key);
    if (existing) return Promise.resolve(cloneOperation(existing));
    const pending = this.inFlight.get(key);
    if (pending) return pending.then(cloneOperation);
    const promise = this.execute({ ...command, idempotencyKey: key })
      .then((operation) => {
        this.operations.set(key, cloneOperation(operation));
        return cloneOperation(operation);
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }

  recordAdjustment(input: {
    operationId: string;
    idempotencyKey: string;
    actor: Exclude<PaymentActor, "verah_agent" | "system">;
    type: "refund" | "reversal";
  }) {
    const key = input.idempotencyKey.trim();
    if (!safeText(key) || !safeText(input.operationId)) throw new Error("payment_invalid_adjustment");
    const replay = this.transitions.get(key);
    if (replay) return cloneOperation(replay);
    const source = [...this.operations.values()].find(({ id }) => id === input.operationId);
    if (!source || source.status !== "confirmed") throw new Error("payment_adjustment_not_allowed");
    const status = input.type === "refund" ? "refunded" : "reversed";
    const code = input.type === "refund" ? "refund_recorded" : "reversal_recorded";
    const adjusted = this.append(source, code, status);
    this.operations.set(source.idempotencyKey, adjusted);
    this.transitions.set(key, adjusted);
    return cloneOperation(adjusted);
  }

  private async execute(command: SandboxPaymentCommand) {
    const operation = createOperation(command);
    let current = this.append(operation, "intent_created", "requires_approval");
    if (!this.enabled) return this.append(current, "payment_failed", "failed", "sandbox_disabled");
    if (command.actor !== "customer") return this.append(current, "actor_blocked", "blocked", "customer_authorization_required");
    if (!command.approval.approved) return this.append(current, "approval_required", "requires_approval");
    if (
      command.approval.quoteId !== command.quoteId ||
      command.approval.quoteVersion !== command.quoteVersion ||
      command.approval.approvedTotal !== command.amounts.customerTotal
    ) {
      return this.append(current, "approval_stale", "requires_approval", "quote_reapproval_required");
    }
    current = this.append(current, "approval_verified", "requires_approval");
    const result = await this.provider.authorize({
      operationId: current.id,
      amount: current.amounts.customerTotal,
      idempotencyKey: current.idempotencyKey,
      methodToken: command.method.token,
    });
    if (result.status === "failed") {
      return this.append(current, "payment_failed", "failed", result.reason);
    }
    return this.append(current, "payment_confirmed", "confirmed", null, result.providerReference);
  }

  private append(
    operation: PaymentOperation,
    code: LedgerEntry["code"],
    status: PaymentStatus,
    failureReason: string | null = operation.failureReason,
    providerReference: string | null = operation.providerReference,
  ) {
    const entry = {
      sequence: operation.ledger.length + 1,
      occurredAt: this.now(),
      code,
      status,
    } satisfies LedgerEntry;
    const next = {
      ...operation,
      status,
      failureReason,
      providerReference,
      ledger: [...operation.ledger, entry],
    };
    this.onEvent({
      operationId: next.id,
      serviceRequestId: next.serviceRequestId,
      quoteId: next.quoteId,
      status,
      code,
      method: { ...next.method },
    });
    return next;
  }
}

function createOperation(command: SandboxPaymentCommand): PaymentOperation {
  return {
    id: `sandbox-payment:${command.idempotencyKey}`,
    serviceRequestId: command.serviceRequestId,
    quoteId: command.quoteId,
    quoteVersion: command.quoteVersion,
    idempotencyKey: command.idempotencyKey,
    status: "requires_approval",
    amounts: { ...command.amounts },
    method: { brand: command.method.brand, last4: command.method.last4 },
    providerReference: null,
    failureReason: null,
    ledger: [],
  };
}

function validateCommand(command: SandboxPaymentCommand) {
  const candidate = command as SandboxPaymentCommand & Record<string, unknown>;
  const serialized = JSON.stringify(candidate);
  if (/"(?:pan|cvv|cardNumber|securityCode)"/i.test(serialized) || /\d{13,19}/.test(serialized)) {
    throw new Error("payment_sensitive_data_rejected");
  }
  if (
    !safeText(command.serviceRequestId) || !safeText(command.quoteId) ||
    !safeText(command.quoteVersion) || !safeText(command.idempotencyKey) ||
    !safeText(command.method.token) || !safeText(command.method.brand) ||
    !/^\d{4}$/.test(command.method.last4) || /\d{12,19}/.test(command.method.token)
  ) {
    throw new Error("payment_invalid_command");
  }
  const { serviceAmount, verahFee, customerTotal } = command.amounts;
  if (![serviceAmount, verahFee, customerTotal].every((value) => Number.isSafeInteger(value) && value >= 0)) {
    throw new Error("payment_invalid_amount");
  }
  if (serviceAmount + verahFee !== customerTotal) throw new Error("payment_total_mismatch");
}

function safeText(value: string) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 200;
}

function cloneOperation(operation: PaymentOperation): PaymentOperation {
  return {
    ...operation,
    amounts: { ...operation.amounts },
    method: { ...operation.method },
    ledger: operation.ledger.map((entry) => ({ ...entry })),
  };
}
