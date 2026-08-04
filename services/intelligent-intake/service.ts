import "server-only";

import { generateDeterministicAssessment } from "./assessment";
import { createIntakeLog, writeIntakeLog, type IntakeLog } from "./observability";
import { persistIntakeTransition, prepareIntakeContext } from "./repository";
import { transitionIntake } from "./state-machine";

export async function processIntelligentIntakeMessage(
  messageId: string,
  dependencies: {
    prepare?: typeof prepareIntakeContext;
    persist?: typeof persistIntakeTransition;
    log?: (entry: IntakeLog) => void;
  } = {},
) {
  const prepare = dependencies.prepare ?? prepareIntakeContext;
  const persist = dependencies.persist ?? persistIntakeTransition;
  const log = dependencies.log ?? writeIntakeLog;
  const context = await prepare(messageId);
  if (context.alreadyProcessed) return { ...context, status: "duplicate" as const };

  const transition = transitionIntake(context);
  const assessment = transition.complete
    ? generateDeterministicAssessment(transition.collectedData, context.attachments)
    : null;
  const result = await persist({ context, transition, assessment });
  log(createIntakeLog({
    correlationId: context.correlationId,
    conversationId: context.conversationId,
    messageId: context.messageId,
    intakeSessionId: context.sessionId,
    customerId: context.customerId,
    vehicleId: result.vehicleId,
    serviceRequestId: result.serviceRequestId,
    event: transition.complete ? "intake.completed" : transition.valid ? "intake.advanced" : "intake.invalid_answer",
  }));
  return result;
}
