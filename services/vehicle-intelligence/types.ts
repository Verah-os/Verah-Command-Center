export type NormalizedVehicleIntelligence = {
  brand: string;
  model: string;
  manufactureYear?: number;
  modelYear: number;
  version?: string;
  engine?: string;
  transmission?: string;
};

export type VehicleIntelligenceEvidence = {
  provider: string;
  source: string;
  observedAt: string;
  confidence: number | null;
  synthetic: boolean;
};

export type VehicleIntelligenceObservation = {
  vehicle: NormalizedVehicleIntelligence;
  evidence: VehicleIntelligenceEvidence;
};

export type VehicleIntelligenceRequest = {
  vehicleReference: string;
};

export type VehicleIntelligenceProvider = {
  id: string;
  access: "local_fixture" | "external";
  paid: boolean;
  estimatedCostMicrounits: number;
  lookup(
    request: VehicleIntelligenceRequest,
    context: { signal: AbortSignal },
  ): Promise<VehicleIntelligenceObservation | null>;
};

export type VehicleIntelligencePolicy = {
  allowExternalProviders: boolean;
  allowPaidProviders: boolean;
  maxCostMicrounits: number;
  timeoutMs: number;
  cacheTtlMs: number;
};

export type VehicleIntelligenceEvent = {
  provider: string;
  code:
    | "provider_blocked"
    | "provider_timeout"
    | "provider_unavailable"
    | "provider_invalid_response"
    | "cache_hit";
};

export type VehicleIntelligenceResult = {
  status: "available" | "unavailable" | "review_required";
  vehicle: NormalizedVehicleIntelligence | null;
  observations: VehicleIntelligenceObservation[];
  requiresHumanReview: boolean;
  reason: "provider_available" | "provider_unavailable" | "provider_blocked" | "provider_conflict";
};

