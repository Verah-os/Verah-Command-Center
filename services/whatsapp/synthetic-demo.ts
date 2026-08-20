import type { ParsedInboundMessage } from "./payload";

type Environment = Record<string, string | undefined>;

const demoAnswers = [
  "Olá",
  "Maria Demo",
  "Honda",
  "Fit",
  "2018",
  "ABC1D23",
  "85000",
  "O motor falha ao acelerar",
  "Principalmente com o motor frio",
  "Acontece todos os dias",
  "Luz amarela do motor",
  "O carro funciona, mas perde força",
  "média",
  "sim",
] as const;

export function isSyntheticPilotDemoEnabled(environment: Environment) {
  if (environment.VERAH_PILOT_ALPHA_SYNTHETIC_DEMO !== "true") return false;
  if (environment.VERCEL_ENV === "production") return false;
  return environment.VERCEL_ENV === "preview" || environment.NODE_ENV !== "production";
}

export function createSyntheticPilotDemoMessages(
  runId: string,
): ParsedInboundMessage[] {
  const digits = [...runId]
    .reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 7)
    .toString()
    .padStart(10, "0")
    .slice(-10);
  const phone = `+55${digits}`;

  return demoAnswers.map((body, index) => ({
    phone,
    externalMessageId: `pilot-alpha-${runId}-${index + 1}`,
    messageType: "text",
    body,
    providerTimestamp: new Date().toISOString(),
    sanitizedMetadata: { source: "pilot_alpha_synthetic_demo" },
  }));
}
