import type { ServiceCategory, ServiceUrgency } from "@/services/service-copilot";

export type ServiceStage = "solicitado" | "concierge_aceitou" | "prestador_indicado" | "aguardando_aprovacao" | "em_execucao" | "concluido" | "cancelado";

export type ServiceRequest = {
  id: string; referenceCode: string; customerName: string; customerPhone: string | null;
  vehicleBrand: string; vehicleModel: string; vehicleYear: number | null; vehiclePlate: string | null;
  city: string; customerReport: string; perceivedUrgency: ServiceUrgency; serviceStage: ServiceStage;
  probableCategory: ServiceCategory | null; copilotSummary: string | null; copilotQuestions: string[];
  copilotRiskSignals: string[]; copilotRecommendedNextStep: string | null; copilotCustomerMessage: string | null;
  copilotConfidence: number | null; requiresHumanReview: boolean; createdAt: string;
};
