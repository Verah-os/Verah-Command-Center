import type {
  ServiceCategory,
  ServiceUrgency,
} from "@/services/service-copilot";

export type ServiceStage =
  | "solicitado"
  | "concierge_aceitou"
  | "prestador_indicado"
  | "aguardando_aprovacao"
  | "em_execucao"
  | "concluido"
  | "cancelado";

export type InsuranceAnswer = "yes" | "no" | "unknown";

export type ServiceRequest = {
  id: string;
  referenceCode: string;
  customerName: string;
  customerPhone: string | null;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleYear: number | null;
  vehiclePlate: string | null;
  state: string | null;
  city: string;
  origin: "customer" | "concierge";
  hasInsurance: InsuranceAnswer;
  insurerName: string | null;
  hasRoadsideAssistance: InsuranceAnswer;
  customerReport: string;
  perceivedUrgency: ServiceUrgency;
  serviceStage: ServiceStage;
  probableCategory: ServiceCategory | null;
  copilotSummary: string | null;
  copilotQuestions: string[];
  copilotAnswers: Record<string, string>;
  customerAnswersSubmittedAt: string | null;
  copilotRiskSignals: string[];
  copilotRecommendedNextStep: string | null;
  copilotCustomerMessage: string | null;
  copilotConciergeBrief: string | null;
  copilotProviderBrief: string | null;
  copilotConfidence: number | null;
  requiresHumanReview: boolean;
  createdAt: string;
  updatedAt: string;
  isPriority: boolean;
  priorityReason: string | null;
  prioritySetAt: string | null;
  prioritySetBy: string | null;
  lastPrioritySetAt: string | null;
  lastPrioritySetBy: string | null;
  lastPriorityReason: string | null;
  priorityRemovedAt: string | null;
  priorityRemovedBy: string | null;
  conciergeId: string | null;
  conciergeAcceptedAt: string | null;
  workOrderId: string | null;
  providerId: string | null;
  providerAssignedAt: string | null;
  providerAssignedBy: string | null;
  providerReassignedAt: string | null;
  providerReassignedBy: string | null;
  providerReassignmentReason: string | null;
  providerCompletedAt: string | null;
  conciergeConfirmedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  cancellationNotes: string | null;
  previousStage: ServiceStage | null;
  lastCancelledAt: string | null;
  lastCancelledBy: string | null;
  lastCancellationReason: string | null;
  lastCancellationNotes: string | null;
  reopenedAt: string | null;
  reopenedBy: string | null;
  reopenReason: string | null;
  completionNotes: string | null;
  customerRating: number | null;
  customerFeedback: string | null;
  customerRatedAt: string | null;
};
