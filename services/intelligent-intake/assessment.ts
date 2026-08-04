import { inferCategory, normalizeText } from "../service-copilot/rules.ts";
import type { IntakeAssessment, IntakeCollectedData } from "./types.ts";

const criticalRules = [
  ["fumaça", ["fumaca", "fogo", "incendio"]],
  ["odor de combustível", ["cheiro de combustivel", "vazamento de combustivel"]],
  ["possível falha de frenagem", ["freio falhou", "sem freio", "pedal afundou"]],
  ["superaquecimento", ["superaquec", "temperatura alta"]],
] as const;

const highRules = [
  ["veículo imobilizado", ["imobilizado", "nao liga", "parado"]],
  ["luz de alerta informada", ["luz vermelha", "oleo", "injeção", "injecao"]],
] as const;

export function generateDeterministicAssessment(
  data: IntakeCollectedData,
  attachments: Array<{ mediaType: string; mimeType: string | null }> = [],
): IntakeAssessment {
  const combined = normalizeText([
    data.symptom,
    data.conditions,
    data.frequency,
    data.dashboardLights,
    data.operatingCondition,
  ].filter(Boolean).join(" "));
  const critical = matches(combined, criticalRules);
  const high = matches(combined, highRules);
  const declared = data.urgency ?? "media";
  const riskLevel = critical.length
    ? "critical"
    : high.length || declared === "alta" || declared === "critica"
      ? "high"
      : declared === "baixa"
        ? "low"
        : "medium";
  const riskFlags = [...critical, ...high];
  const hypotheses = hypothesesFor(combined);
  const missingQuestions = requiredMissing(data);
  const symptom = data.symptom ?? "Sintoma não informado";

  return {
    inputSnapshot: {
      vehicle: data.vehicle ?? {},
      mileage: data.mileage ?? null,
      symptom,
      conditions: data.conditions ?? null,
      frequency: data.frequency ?? null,
      dashboardLights: data.dashboardLights ?? null,
      operatingCondition: data.operatingCondition ?? null,
      urgency: data.urgency ?? null,
      attachmentTypes: attachments.map((attachment) => attachment.mediaType),
    },
    summary: `${data.vehicle?.brand ?? "Veículo"} ${data.vehicle?.model ?? ""}: ${symptom}. Revisão humana obrigatória.`,
    normalizedSymptoms: [symptom],
    conditions: [data.conditions, data.frequency, data.operatingCondition].filter((value): value is string => Boolean(value)),
    missingQuestions,
    hypotheses,
    riskLevel,
    riskFlags,
    safeNextStep:
      riskLevel === "critical"
        ? "Não utilize o veículo e aguarde orientação do Concierge VERAH ou suporte emergencial apropriado."
        : "Aguarde a revisão do Concierge VERAH antes de autorizar qualquer reparo.",
    confidence: riskFlags.length ? 0.78 : 0.62,
    requiresHumanReview: true,
    engineType: "deterministic",
    engineVersion: "intake-rules-1.0.0",
    probableCategory: inferCategory(combined),
  };
}

function matches(
  value: string,
  rules: readonly (readonly [string, readonly string[]])[],
) {
  return rules.flatMap(([label, terms]) =>
    terms.some((term) => value.includes(term)) ? [label] : [],
  );
}

function hypothesesFor(value: string) {
  const candidates: Array<[string, string[], string]> = [
    ["Sistema elétrico ou bateria", ["nao liga", "bateria", "painel"], "sinais elétricos relatados"],
    ["Sistema de frenagem", ["freio", "pedal"], "comportamento de frenagem relatado"],
    ["Sistema de arrefecimento", ["temperatura", "superaquec", "vapor"], "sinais térmicos relatados"],
    ["Conjunto de motor", ["motor", "falha", "ruido"], "sintoma relacionado ao funcionamento"],
  ];
  return candidates.flatMap(([label, terms, basis]) =>
    terms.some((term) => value.includes(term))
      ? [{ label: `Hipótese para verificação: ${label}`, basis }]
      : [],
  );
}

function requiredMissing(data: IntakeCollectedData) {
  return [
    data.mileage === undefined ? "Confirmar quilometragem" : null,
    !data.conditions ? "Detalhar condições do sintoma" : null,
    !data.dashboardLights ? "Confirmar luzes do painel" : null,
  ].filter((value): value is string => Boolean(value));
}
