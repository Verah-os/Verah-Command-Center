import { DEMO_VEHICLE_REFERENCE } from "../services/vehicle-intelligence/index.ts";
import type { ServiceStage } from "../types/service-request.ts";

const serviceAmount = 580;
const verahFee = 79;

export const customerPilotDemo = {
  id: "CUSTOMER-PILOT-DEMO-V1",
  synthetic: true,
  customer: { firstName: "Marina", fullName: "Marina Alves" },
  vehicle: {
    id: DEMO_VEHICLE_REFERENCE,
    name: "Volkswagen Polo",
    year: "2021/2022",
    fuel: "Flex",
    mileageAtIntake: 48_320,
    mileageAtCompletion: 48_327,
    plate: "D3M0-*** · placa fictícia",
  },
  report:
    "Quando passo em rua irregular começou um barulho na frente do carro. Também sinto uma pequena vibração no volante e não sei se é perigoso continuar usando.",
  reassurance:
    "Vamos cuidar disso. Antes de qualquer serviço, você recebe uma explicação simples e o valor para aprovar.",
  triage: {
    category: "Suspensão e direção",
    priority: "Avaliação recomendada",
    disclaimer: "A triagem organiza o próximo passo; não declara diagnóstico.",
  },
  transport: {
    title: "Leva-e-traz VERAH",
    description:
      "Coleta, conferência e entrega coordenadas pela VERAH, com acompanhamento em cada etapa.",
  },
  quote: {
    summary:
      "Após avaliação profissional, o escopo demonstrativo inclui substituição do par de bieletas e alinhamento.",
    rationale:
      "Selecionado pela disponibilidade imediata e documentação mais completa — não apenas pelo menor preço.",
    items: [
      { label: "Inspeção dianteira", amount: 80 },
      { label: "Par de bieletas", amount: 220 },
      { label: "Mão de obra", amount: 160 },
      { label: "Alinhamento", amount: 120 },
    ],
    serviceAmount,
    verahFee,
    total: serviceAmount + verahFee,
    duration: "Mesmo dia após aprovação",
    warranty: "90 dias sobre o serviço · fixture demonstrativa",
  },
  payment: {
    method: "Visa •••• 4821",
    mode: "sandbox/mock" as const,
    disclaimer: "Simulação: nenhuma cobrança ou movimentação financeira será realizada.",
  },
  timeline: [
    event("09:05", "solicitado", "Pedido recebido"),
    event("09:12", "concierge_aceitou", "Concierge iniciou o atendimento"),
    event("09:35", "prestador_indicado", "Veículo em avaliação com leva-e-traz acompanhado"),
    event("10:18", "prestador_indicado", "Propostas recebidas"),
    event("10:32", "aguardando_aprovacao", "VERAH concluiu a análise"),
    event("10:41", "aguardando_aprovacao", "Marina aprovou o total demonstrativo"),
    event("11:05", "em_execucao", "Serviço iniciado"),
    event("14:20", "em_execucao", "Execução concluída pelo especialista selecionado"),
    event("14:42", "em_execucao", "Conferência VERAH"),
    event("15:00", "em_execucao", "Pronto para entrega"),
    event("15:35", "concluido", "Atendimento concluído"),
  ],
  completion: {
    service: "Suspensão dianteira — bieletas substituídas + alinhamento",
    note: "Concluído após avaliação profissional, sem alteração não autorizada.",
    rating: "5/5",
  },
  passport: {
    event:
      "Suspensão dianteira — bieletas substituídas + alinhamento | 48.327 km | origem: atendimento VERAH demonstrativo | documento: comprovante sintético.",
  },
  nextCare: [
    "Revisar condição da suspensão no próximo atendimento — recomendação profissional da fixture.",
    "Histórico atualizado em 48.327 km.",
    "A VERAH continuará acompanhando seu histórico.",
  ],
} as const;

function event(time: string, stage: ServiceStage, label: string) {
  return { time, stage, label };
}
