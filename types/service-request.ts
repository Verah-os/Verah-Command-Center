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
  completionNotes: string | null;
  customerRating: number | null;
  customerFeedback: string | null;
  customerRatedAt: string | null;
};
