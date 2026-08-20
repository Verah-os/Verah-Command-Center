import type { QuoteQualityClassification } from "@/services/quote-quality/types";
import type { SecondOpinionOutcome } from "@/services/second-opinion/types";

export type ConciergeDemoState = "ready" | "empty" | "error";

export type ConciergeDemoFixture = {
  reference: string;
  customer: string;
  vehicle: string;
  city: string;
  urgency: "Alta" | "Média" | "Baixa";
  reportedProblem: string;
  intake: {
    summary: string;
    riskSignals: string[];
    safeNextStep: string;
  };
  invitations: Array<{
    provider: string;
    status: "Aceitou" | "Aguardando resposta" | "Recusou";
    context: string;
  }>;
  proposals: Array<{
    provider: string;
    total: number;
    duration: string;
    warranty: string;
    classification: QuoteQualityClassification;
    qualityLabel: string;
    qualityReason: string;
    highlight: string;
  }>;
  comparison: {
    basis: string;
    recommendation: string;
    caveat: string;
  };
  secondOpinion: {
    outcome: SecondOpinionOutcome;
    label: string;
    summary: string;
  };
  decision: {
    status: "human_required";
    prompt: string;
  };
};

export const conciergeDemoQueue = [
  {
    reference: "VERAH-2481",
    customer: "Marina Alves",
    vehicle: "Honda Fit 2018",
    stage: "Decisão pendente",
    urgency: "Alta",
  },
  {
    reference: "VERAH-2480",
    customer: "Ana Ribeiro",
    vehicle: "Toyota Etios 2020",
    stage: "Aguardando propostas",
    urgency: "Média",
  },
  {
    reference: "VERAH-2479",
    customer: "Clara Nunes",
    vehicle: "Renault Sandero 2017",
    stage: "Intake em revisão",
    urgency: "Baixa",
  },
] as const;

export const conciergeDemoFixture: ConciergeDemoFixture = {
  reference: "VERAH-2481",
  customer: "Marina Alves",
  vehicle: "Honda Fit 2018 · 85.000 km",
  city: "São Paulo",
  urgency: "Alta",
  reportedProblem:
    "O motor falha ao acelerar quando está frio e a luz amarela do painel acendeu.",
  intake: {
    summary:
      "Perda de força recorrente com luz de injeção acesa, mais perceptível nas primeiras acelerações do dia.",
    riskSignals: [
      "Luz de injeção acesa",
      "Perda de força durante a condução",
    ],
    safeNextStep:
      "Evitar trajetos longos e realizar diagnóstico eletrônico antes de autorizar troca de peças.",
  },
  invitations: [
    {
      provider: "Oficina Horizonte",
      status: "Aceitou",
      context: "Especialista em injeção eletrônica · 4,9 de avaliação",
    },
    {
      provider: "Auto Center Vila Nova",
      status: "Aceitou",
      context: "Atendimento próximo · 4,7 de avaliação",
    },
    {
      provider: "Garage Norte",
      status: "Recusou",
      context: "Sem agenda no prazo necessário",
    },
  ],
  proposals: [
    {
      provider: "Oficina Horizonte",
      total: 860,
      duration: "1 dia útil",
      warranty: "90 dias",
      classification: "comparison_ready",
      qualityLabel: "Pronta para comparar",
      qualityReason:
        "Separa diagnóstico, mão de obra e peças e informa prazo e garantia.",
      highlight: "Melhor detalhamento técnico",
    },
    {
      provider: "Auto Center Vila Nova",
      total: 690,
      duration: "Até 2 dias úteis",
      warranty: "90 dias",
      classification: "usable_with_caveats",
      qualityLabel: "Comparável com ressalva",
      qualityReason:
        "Preço e garantia estão claros, mas a peça só será definida após o diagnóstico.",
      highlight: "Menor valor inicial",
    },
  ],
  comparison: {
    basis: "Mesmo escopo inicial: diagnóstico eletrônico e correção da falha.",
    recommendation:
      "A proposta da Oficina Horizonte oferece mais previsibilidade; a Vila Nova custa menos antes da confirmação da peça.",
    caveat:
      "O valor final pode mudar se o diagnóstico identificar uma peça diferente. A cliente deve aprovar qualquer alteração.",
  },
  secondOpinion: {
    outcome: "questions_scope",
    label: "Escopo precisa de confirmação",
    summary:
      "A segunda oficina concorda com o diagnóstico eletrônico, mas recomenda confirmar bobinas e velas antes de substituir componentes.",
  },
  decision: {
    status: "human_required",
    prompt:
      "Revise as diferenças com a cliente e registre a escolha somente após a confirmação dela.",
  },
};

export function parseConciergeDemoState(value?: string): ConciergeDemoState {
  return value === "empty" || value === "error" ? value : "ready";
}

export function hasCompleteConciergeDemoJourney(
  fixture: ConciergeDemoFixture,
) {
  return Boolean(
    fixture.reportedProblem &&
      fixture.intake.summary &&
      fixture.invitations.length > 1 &&
      fixture.proposals.length > 1 &&
      fixture.proposals.every(
        (proposal) => proposal.qualityLabel && proposal.qualityReason,
      ) &&
      fixture.comparison.recommendation &&
      fixture.secondOpinion.summary &&
      fixture.decision.status === "human_required",
  );
}
