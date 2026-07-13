import type {
  ServiceCategory,
  ServiceCopilotInput,
  ServiceUrgency,
} from "./types";

const criticalTerms = [
  "fumaca",
  "cheiro de combustivel",
  "superaquecimento",
  "falha de freio",
  "risco de incendio",
  "fogo",
];
const highTerms = [
  "carro nao liga",
  "carro parado",
  "pane",
  "bateria descarregada",
  "veiculo imobilizado",
];
const lowTerms = [
  "troca de oleo",
  "revisao",
  "alinhamento",
  "balanceamento",
  "lavagem",
  "manutencao periodica",
];
const urgencyRank: Record<ServiceUrgency, number> = {
  baixa: 0,
  media: 1,
  alta: 2,
  critica: 3,
};

export function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function matches(report: string, terms: string[]) {
  return terms.filter((term) => report.includes(term));
}

export function inferCategory(report: string): ServiceCategory {
  const rules: Array<[ServiceCategory, string[]]> = [
    ["emergencia", criticalTerms],
    ["freios", ["freio", "pastilha"]],
    ["bateria", ["bateria", "nao liga"]],
    ["eletrica", ["eletric", "luz do painel", "farol"]],
    ["manutencao_preventiva", lowTerms],
    ["motor", ["motor", "superaquec"]],
    ["pneus", ["pneu", "alinhamento", "balanceamento"]],
    ["suspensao", ["suspensao", "amortecedor"]],
    ["vidros", ["vidro", "parabrisa"]],
    ["chave", ["chave"]],
    ["ar_condicionado", ["ar condicionado"]],
    ["funilaria", ["funilaria", "amassado", "pintura"]],
  ];
  return (
    rules.find(([, terms]) =>
      terms.some((term) => report.includes(term)),
    )?.[0] ?? "outro"
  );
}

export function applyDeterministicRules(input: ServiceCopilotInput) {
  const report = normalizeText(input.customerReport);
  const criticalSignals = matches(report, criticalTerms);
  const highSignals = matches(report, highTerms);
  const lowSignals = matches(report, lowTerms);
  let urgency = input.perceivedUrgency;

  if (criticalSignals.length) urgency = "critica";
  else if (highSignals.length && urgencyRank[urgency] < urgencyRank.alta)
    urgency = "alta";
  else if (lowSignals.length && input.perceivedUrgency === "media")
    urgency = "baixa";

  return {
    urgency,
    riskSignals: [...criticalSignals, ...highSignals],
    probableCategory: inferCategory(report),
  };
}
