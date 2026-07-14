import { applyDeterministicRules } from "./rules";
import type { ServiceCopilotInput, ServiceCopilotOutput } from "./types";

const questionsByCategory: Record<
  ServiceCopilotOutput["probableCategory"],
  string[]
> = {
  manutencao_preventiva: [
    "Quando foi realizada a última manutenção?",
    "Qual é a quilometragem aproximada?",
    "Existe alguma luz acesa no painel?",
  ],
  freios: [
    "O problema acontece somente ao frear?",
    "O pedal está baixo, duro ou normal?",
    "Existe luz de freio ou ABS acesa?",
    "O veículo está em local seguro?",
  ],
  motor: [
    "Existe fumaça, cheiro forte ou superaquecimento?",
    "Alguma luz está acesa no painel?",
    "O veículo perdeu força ou está falhando?",
    "O veículo está em local seguro?",
  ],
  eletrica: [
    "O veículo dá partida?",
    "Faróis e painel acendem normalmente?",
    "O problema começou de forma repentina?",
  ],
  bateria: [
    "O veículo dá partida?",
    "Há ruído de clique ao tentar ligar?",
    "Sabe quando a bateria foi trocada?",
  ],
  suspensao: [
    "O ruído ocorre em buracos ou curvas?",
    "O veículo está puxando para algum lado?",
    "Há vibração no volante?",
  ],
  pneus: [
    "Existe pneu murcho, furado ou com desgaste visível?",
    "O veículo apresenta vibração?",
    "Qual pneu parece afetado?",
  ],
  ar_condicionado: [
    "O sistema não liga ou apenas não resfria?",
    "Existe ruído ou cheiro diferente?",
    "O problema é constante ou intermitente?",
  ],
  vidros: [
    "O vidro está quebrado, trincado ou travado?",
    "Existe risco de entrada de água?",
    "O veículo está em local seguro?",
  ],
  chave: [
    "A chave foi perdida, quebrada ou parou de funcionar?",
    "Existe uma chave reserva?",
    "O veículo está travado?",
  ],
  emergencia: [
    "O veículo está em local seguro?",
    "Há risco de incêndio, combustível ou trânsito?",
    "Existem pessoas em risco?",
    "O veículo consegue se mover?",
  ],
  outro: [
    "Quando o problema começou?",
    "Com que frequência ocorre?",
    "O veículo está em local seguro?",
  ],
  funilaria: [
    "Quando o dano aconteceu?",
    "O veículo consegue circular com segurança?",
    "Há partes soltas ou pontiagudas?",
  ],
};

export function runMockServiceCopilot(
  input: ServiceCopilotInput,
): ServiceCopilotOutput {
  const rules = applyDeterministicRules(input);
  const critical = rules.urgency === "critica";
  const vehicle = `${input.vehicleBrand} ${input.vehicleModel}${input.vehicleYear ? ` ${input.vehicleYear}` : ""}`;
  const missingQuestions = [
    ...new Set(questionsByCategory[rules.probableCategory]),
  ];

  return {
    summary: `Relato sobre ${vehicle} em ${input.city}: ${input.customerReport.slice(0, 180)}${input.customerReport.length > 180 ? "…" : ""}`,
    probableCategory: rules.probableCategory,
    missingQuestions,
    urgency: rules.urgency,
    riskSignals: rules.riskSignals,
    recommendedNextStep: critical
      ? "Interromper o uso do veículo, manter distância de risco e aguardar orientação humana."
      : "Aguardar a revisão do Concierge da VERAH antes de qualquer encaminhamento.",
    customerMessage: critical
      ? "Identificamos um possível risco imediato. Não continue dirigindo. Vá para um local seguro, se isso puder ser feito sem risco, e aguarde orientação."
      : "Recebemos seu relato. Um Concierge da VERAH revisará as informações e orientará o próximo passo com clareza.",
    conciergeBrief: `${vehicle}, ${input.city}. Categoria provável: ${rules.probableCategory}. Urgência: ${rules.urgency}. Validar o relato antes de encaminhar.`,
    providerBrief: `Solicitação preliminar para ${vehicle}. Não há diagnóstico confirmado; aguardar triagem humana.`,
    confidence: rules.probableCategory === "outro" ? 0.58 : 0.82,
    requiresHumanReview: true,
  };
}
