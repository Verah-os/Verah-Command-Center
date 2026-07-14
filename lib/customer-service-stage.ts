import type { ServiceStage } from "@/types/service-request";

export const customerStageLabels: Record<ServiceStage, string> = {
  solicitado: "Solicitação recebida",
  concierge_aceitou: "Análise da VERAH",
  prestador_indicado: "Preparando proposta",
  aguardando_aprovacao: "Aguardando sua aprovação",
  em_execucao: "Serviço em andamento",
  concluido: "Atendimento concluído",
  cancelado: "Atendimento cancelado",
};

export const customerJourneyStages: ServiceStage[] = [
  "solicitado",
  "concierge_aceitou",
  "prestador_indicado",
  "aguardando_aprovacao",
  "em_execucao",
  "concluido",
];
