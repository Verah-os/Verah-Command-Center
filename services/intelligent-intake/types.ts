export const INTAKE_STATUSES = [
  "started",
  "collecting_vehicle",
  "collecting_mileage",
  "collecting_symptoms",
  "collecting_conditions",
  "collecting_risk",
  "waiting_customer",
  "ready",
  "completed",
  "cancelled",
  "abandoned",
] as const;

export type IntakeStatus = (typeof INTAKE_STATUSES)[number];

export const INTAKE_STEPS = [
  "welcome",
  "customer_name",
  "vehicle_choice",
  "vehicle_brand",
  "vehicle_model",
  "vehicle_year",
  "vehicle_plate",
  "mileage",
  "symptom",
  "conditions",
  "frequency",
  "dashboard_lights",
  "operating_condition",
  "urgency",
  "location",
  "confirmation",
  "completed",
] as const;

export type IntakeStep = (typeof INTAKE_STEPS)[number];
export type IntakeUrgency = "baixa" | "media" | "alta" | "critica";

export type IntakeVehicle = {
  brand?: string;
  model?: string;
  year?: number;
  plate?: string | null;
  version?: string | null;
  engineType?: string | null;
  transmission?: string | null;
};

export type IntakeCollectedData = {
  customerName?: string;
  vehicleMode?: "existing" | "new";
  vehicle?: IntakeVehicle;
  mileage?: number;
  symptom?: string;
  conditions?: string;
  frequency?: string;
  dashboardLights?: string;
  operatingCondition?: string;
  urgency?: IntakeUrgency;
  location?: string;
};

export type IntakeVehicleOption = {
  id: string;
  brand: string;
  model: string;
  year: number | null;
  plate: string | null;
};

export type IntakeContext = {
  alreadyProcessed: boolean;
  messageId: string;
  messageType: string;
  messageBody: string | null;
  conversationId: string;
  customerId: string;
  customerDisplayName: string;
  sessionId: string;
  correlationId: string;
  status: IntakeStatus;
  currentStep: IntakeStep;
  collectedData: IntakeCollectedData;
  vehicleId: string | null;
  vehicles: IntakeVehicleOption[];
  attachments: Array<{ mediaType: string; mimeType: string | null }>;
  resumed: boolean;
  serviceRequestId: string | null;
};

export type IntakeAssessment = {
  inputSnapshot: Record<string, unknown>;
  summary: string;
  normalizedSymptoms: string[];
  conditions: string[];
  missingQuestions: string[];
  hypotheses: Array<{ label: string; basis: string }>;
  riskLevel: "low" | "medium" | "high" | "critical";
  riskFlags: string[];
  safeNextStep: string;
  confidence: number;
  requiresHumanReview: true;
  engineType: "deterministic";
  engineVersion: string;
  probableCategory:
    | "manutencao_preventiva"
    | "eletrica"
    | "motor"
    | "freios"
    | "suspensao"
    | "pneus"
    | "bateria"
    | "vidros"
    | "chave"
    | "ar_condicionado"
    | "funilaria"
    | "emergencia"
    | "outro";
};

export type IntakeTransition = {
  valid: boolean;
  nextStatus: IntakeStatus;
  nextStep: IntakeStep;
  collectedData: IntakeCollectedData;
  response: string;
  vehicleId?: string | null;
  customerDisplayName?: string | null;
  complete: boolean;
};

