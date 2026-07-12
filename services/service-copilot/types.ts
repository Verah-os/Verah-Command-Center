export const serviceCategories = [
  "manutencao_preventiva", "eletrica", "motor", "freios", "suspensao", "pneus",
  "bateria", "vidros", "chave", "ar_condicionado", "funilaria", "emergencia", "outro"
] as const;

export const urgencyLevels = ["baixa", "media", "alta", "critica"] as const;

export type ServiceCategory = (typeof serviceCategories)[number];
export type ServiceUrgency = (typeof urgencyLevels)[number];

export type ServiceCopilotInput = {
  customerReport: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleYear?: number | null;
  city: string;
  perceivedUrgency: ServiceUrgency;
};

export type ServiceCopilotOutput = {
  summary: string;
  probableCategory: ServiceCategory;
  missingQuestions: string[];
  urgency: ServiceUrgency;
  riskSignals: string[];
  recommendedNextStep: string;
  customerMessage: string;
  conciergeBrief: string;
  providerBrief: string;
  confidence: number;
  requiresHumanReview: boolean;
};
