import type {
  NormalizedVehicleIntelligence,
  VehicleIntelligenceEvent,
  VehicleIntelligenceObservation,
  VehicleIntelligencePolicy,
  VehicleIntelligenceProvider,
  VehicleIntelligenceRequest,
  VehicleIntelligenceResult,
} from "./types.ts";

export const defaultVehicleIntelligencePolicy: VehicleIntelligencePolicy = {
  allowExternalProviders: false,
  allowPaidProviders: false,
  maxCostMicrounits: 0,
  timeoutMs: 1_000,
  cacheTtlMs: 5 * 60_000,
};

type CacheEntry = {
  observation: VehicleIntelligenceObservation;
  expiresAt: number;
};

export class InMemoryVehicleIntelligenceCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  get(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.observation;
  }

  set(key: string, observation: VehicleIntelligenceObservation, ttlMs: number) {
    this.entries.set(key, { observation, expiresAt: this.now() + ttlMs });
  }
}

type ResolveOptions = {
  request: VehicleIntelligenceRequest;
  providers: VehicleIntelligenceProvider[];
  policy?: Partial<VehicleIntelligencePolicy>;
  cache?: InMemoryVehicleIntelligenceCache;
  onEvent?: (event: VehicleIntelligenceEvent) => void;
};

class ProviderTimeoutError extends Error {}

export async function resolveVehicleIntelligence({
  request,
  providers,
  policy: policyOverrides,
  cache = new InMemoryVehicleIntelligenceCache(),
  onEvent = () => undefined,
}: ResolveOptions): Promise<VehicleIntelligenceResult> {
  const policy = { ...defaultVehicleIntelligencePolicy, ...policyOverrides };
  const observations: VehicleIntelligenceObservation[] = [];
  let spentMicrounits = 0;
  let blocked = 0;

  for (const provider of providers) {
    const providerName = safeProviderName(provider.id);
    const exceedsBudget =
      provider.estimatedCostMicrounits < 0 ||
      spentMicrounits + provider.estimatedCostMicrounits > policy.maxCostMicrounits;
    if (
      (provider.access === "external" && !policy.allowExternalProviders) ||
      (provider.paid && !policy.allowPaidProviders) ||
      exceedsBudget
    ) {
      blocked += 1;
      onEvent({ provider: providerName, code: "provider_blocked" });
      continue;
    }

    const cacheKey = `${provider.id}:${request.vehicleReference}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      observations.push(cached);
      onEvent({ provider: providerName, code: "cache_hit" });
      continue;
    }

    spentMicrounits += provider.estimatedCostMicrounits;
    try {
      const observation = await lookupWithTimeout(provider, request, policy.timeoutMs);
      if (!observation) {
        onEvent({ provider: providerName, code: "provider_unavailable" });
        continue;
      }
      if (!isValidObservation(observation, provider.id)) {
        onEvent({ provider: providerName, code: "provider_invalid_response" });
        continue;
      }
      cache.set(cacheKey, observation, policy.cacheTtlMs);
      observations.push(observation);
    } catch (error) {
      onEvent({
        provider: providerName,
        code: error instanceof ProviderTimeoutError ? "provider_timeout" : "provider_unavailable",
      });
    }
  }

  if (observations.length === 0) {
    return {
      status: "unavailable",
      vehicle: null,
      observations: [],
      requiresHumanReview: false,
      reason: blocked === providers.length && providers.length > 0
        ? "provider_blocked"
        : "provider_unavailable",
    };
  }

  if (hasConflict(observations)) {
    return {
      status: "review_required",
      vehicle: null,
      observations,
      requiresHumanReview: true,
      reason: "provider_conflict",
    };
  }

  return {
    status: "available",
    vehicle: observations[0].vehicle,
    observations,
    requiresHumanReview: false,
    reason: "provider_available",
  };
}

async function lookupWithTimeout(
  provider: VehicleIntelligenceProvider,
  request: VehicleIntelligenceRequest,
  timeoutMs: number,
) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      provider.lookup(request, { signal: controller.signal }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new ProviderTimeoutError("provider_timeout"));
          controller.abort();
        }, Math.max(1, timeoutMs));
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isValidObservation(
  observation: unknown,
  providerId: string,
) {
  if (!observation || typeof observation !== "object") return false;
  const candidate = observation as Partial<VehicleIntelligenceObservation>;
  if (!candidate.vehicle || typeof candidate.vehicle !== "object") return false;
  if (!candidate.evidence || typeof candidate.evidence !== "object") return false;
  const vehicle = candidate.vehicle;
  const evidence = candidate.evidence;
  return Boolean(
    boundedText(vehicle.brand) &&
      boundedText(vehicle.model) &&
      validYear(vehicle.modelYear) &&
      (vehicle.manufactureYear === undefined || validYear(vehicle.manufactureYear)) &&
      optionalText(vehicle.version) &&
      optionalText(vehicle.engine) &&
      optionalText(vehicle.transmission) &&
      evidence.provider === providerId &&
      boundedText(evidence.source) &&
      typeof evidence.observedAt === "string" &&
      !Number.isNaN(Date.parse(evidence.observedAt)) &&
      (evidence.confidence === null ||
        (typeof evidence.confidence === "number" &&
          Number.isFinite(evidence.confidence) &&
          evidence.confidence >= 0 &&
          evidence.confidence <= 1)) &&
      typeof evidence.synthetic === "boolean"
  );
}

function boundedText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 120;
}

function optionalText(value: unknown) {
  return value === undefined || boundedText(value);
}

function validYear(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 1886 && Number(value) <= 2100;
}

function hasConflict(observations: VehicleIntelligenceObservation[]) {
  const fields: Array<keyof NormalizedVehicleIntelligence> = [
    "brand",
    "model",
    "manufactureYear",
    "modelYear",
    "version",
    "engine",
    "transmission",
  ];
  return fields.some((field) => {
    const values = observations
      .map(({ vehicle }) => vehicle[field])
      .filter((value) => value !== undefined)
      .map(normalizeComparable);
    return new Set(values).size > 1;
  });
}

function normalizeComparable(value: string | number) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("pt-BR") : String(value);
}

function safeProviderName(value: string) {
  if (
    /^[a-z0-9][a-z0-9_-]{0,63}$/.test(value) &&
    !/authorization|credential|password|secret|token|gh[pousr]_/i.test(value)
  ) {
    return value;
  }
  return "unknown_provider";
}
