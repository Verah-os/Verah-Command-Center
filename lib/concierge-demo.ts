import type { QuoteQualityClassification } from "@/services/quote-quality/types";
import type { SecondOpinionOutcome } from "@/services/second-opinion/types";
import { customerPilotDemo as demo } from "./customer-pilot-demo.ts";

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
    reference: "Caso Marina · demo",
    customer: demo.customer.fullName,
    vehicle: `${demo.vehicle.name} ${demo.vehicle.year}`,
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
  reference: "Caso Marina · demonstração",
  customer: demo.customer.fullName,
  vehicle: `${demo.vehicle.name} · ${demo.vehicle.year} · ${demo.vehicle.mileageAtIntake.toLocaleString("pt-BR")} km`,
  city: "São Paulo",
  urgency: "Alta",
  reportedProblem: demo.report,
  intake: {
    summary: demo.triage.summary,
    riskSignals: [...demo.triage.riskSignals],
    safeNextStep: demo.triage.safeNextStep,
  },
  invitations: [...demo.network.invitations],
  proposals: [...demo.network.proposals],
  comparison: demo.network.comparison,
  secondOpinion: {
    outcome: "questions_scope",
    ...demo.network.secondOpinion,
  },
  decision: {
    status: "human_required",
    prompt: demo.network.decisionPrompt,
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
