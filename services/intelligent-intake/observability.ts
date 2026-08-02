export type IntakeLog = {
  correlationId: string;
  conversationId: string;
  messageId: string;
  intakeSessionId: string;
  customerId: string;
  vehicleId: string | null;
  serviceRequestId: string | null;
  integration: "whatsapp";
  event: string;
  timestamp: string;
};

export function createIntakeLog(input: Omit<IntakeLog, "integration" | "timestamp">): IntakeLog {
  return { ...input, integration: "whatsapp", timestamp: new Date().toISOString() };
}

export function writeIntakeLog(log: IntakeLog) {
  console.info(JSON.stringify(log));
}

