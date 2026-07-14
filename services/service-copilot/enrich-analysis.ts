import { normalizeText } from "./rules";
import type { ServiceCopilotOutput, ServiceUrgency } from "./types";

const criticalSignals: Array<[string, string]> = [
  ["fumaca", "fumaça informada pela cliente"],
  ["cheiro de combustivel", "cheiro de combustível informado pela cliente"],
  ["falha de freio", "possível falha de freio informada pela cliente"],
  ["fogo", "risco de incêndio informado pela cliente"],
  ["incendio", "risco de incêndio informado pela cliente"],
  ["superaquec", "superaquecimento informado pela cliente"],
  ["local inseguro", "veículo em local inseguro"],
  ["pessoas em risco", "pessoas em risco"],
];

export type EnrichedAnalysis = {
  answersSummary: string;
  updatedConciergeBrief: string;
  updatedProviderBrief: string;
  updatedRiskSignals: string[];
  updatedUrgency: ServiceUrgency;
};

export function enrichAnalysisWithAnswers(
  original: ServiceCopilotOutput,
  questions: string[],
  answers: Record<string, string>,
): EnrichedAnalysis {
  const entries = questions.flatMap((question) =>
    answers[question]?.trim()
      ? [[question, answers[question].trim()] as const]
      : [],
  );
  const answersSummary = entries
    .map(([question, answer]) => `${question}: ${answer}`)
    .join("\n");
  const normalizedAnswers = normalizeText(
    entries.map(([, answer]) => answer).join(" "),
  );
  const detectedRisks = criticalSignals.flatMap(([term, label]) =>
    normalizedAnswers.includes(term) ? [label] : [],
  );
  const updatedRiskSignals = [
    ...new Set([...original.riskSignals, ...detectedRisks]),
  ];
  const updatedUrgency = detectedRisks.length ? "critica" : original.urgency;
  return {
    answersSummary,
    updatedConciergeBrief: `${original.conciergeBrief}\n\nRespostas da cliente:\n${answersSummary || "Nenhuma resposta."}`,
    updatedProviderBrief: `${original.providerBrief}\n\nInformações complementares:\n${answersSummary || "Nenhuma resposta."}`,
    updatedRiskSignals,
    updatedUrgency,
  };
}
