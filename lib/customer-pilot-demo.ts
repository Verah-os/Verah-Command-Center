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
    summary:
      "Barulho dianteiro em piso irregular e pequena vibração no volante, sem conclusão mecânica automática.",
    riskSignals: [
      "Vibração percebida no volante",
      "Ruído recorrente na dianteira",
    ],
    safeNextStep:
      "Coordenar uma avaliação profissional antes de autorizar qualquer troca de peça.",
  },
  transport: {
    title: "Leva-e-traz VERAH",
    description:
      "Coleta, conferência e entrega coordenadas pela VERAH, com acompanhamento em cada etapa.",
  },
  quote: {
    id: "DEMO-QUOTE-A",
    version: "1",
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
  network: {
    invitations: [
      {
        provider: "Centro Automotivo A",
        status: "Aceitou",
        context: "Disponibilidade imediata e documentação completa",
      },
      {
        provider: "Especialista Suspensão B",
        status: "Aceitou",
        context: "Disponibilidade em 1 dia útil",
      },
      {
        provider: "Oficina Multimarcas C",
        status: "Aguardando resposta",
        context: "Convite sintético enviado",
      },
    ],
    proposals: [
      {
        provider: "Centro Automotivo A",
        total: 580,
        duration: "Mesmo dia após aprovação",
        warranty: "90 dias · fixture",
        classification: "comparison_ready",
        qualityLabel: "Clara e documentada",
        qualityReason: "Detalha inspeção, peças, mão de obra, alinhamento e prazo.",
        highlight: "Recomendação VERAH",
      },
      {
        provider: "Especialista Suspensão B",
        total: 560,
        duration: "1 dia útil",
        warranty: "90 dias · fixture",
        classification: "usable_with_caveats",
        qualityLabel: "Comparável com ressalva",
        qualityReason: "Tem menor preço, mas documentação menos completa para decisão imediata.",
        highlight: "Menor valor",
      },
    ],
    comparison: {
      basis: "Mesmo escopo inicial: avaliação da suspensão dianteira, bieletas e alinhamento.",
      recommendation:
        "A proposta A custa R$20 a mais, mas combina atendimento no mesmo dia com evidências e escopo mais claros.",
      caveat:
        "A recomendação organiza evidências; Marina continua responsável pela aprovação final.",
    },
    secondOpinion: {
      label: "Escopo comparado por uma segunda avaliação",
      summary:
        "As duas propostas convergem no escopo após avaliação profissional; nenhuma peça é tratada como diagnóstico antes dessa confirmação.",
    },
    decisionPrompt:
      "Explique prazo, evidências e diferença de R$20 para Marina antes de registrar a escolha.",
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
