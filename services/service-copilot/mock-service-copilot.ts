import { applyDeterministicRules } from "./rules";
import type { ServiceCopilotInput, ServiceCopilotOutput } from "./types";

export function runMockServiceCopilot(input: ServiceCopilotInput): ServiceCopilotOutput {
  const rules = applyDeterministicRules(input);
  const critical = rules.urgency === "critica";
  const vehicle = `${input.vehicleBrand} ${input.vehicleModel}${input.vehicleYear ? ` ${input.vehicleYear}` : ""}`;
  const missingQuestions = [
    "O veículo está em local seguro?",
    ...(input.customerReport.length < 80 ? ["Quando o problema começou e com que frequência acontece?"] : []),
    ...(rules.probableCategory === "outro" ? ["Há alguma luz acesa ou ruído diferente no veículo?"] : [])
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
    requiresHumanReview: true
  };
}
