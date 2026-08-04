import type { IntakeCollectedData, IntakeStep, IntakeVehicleOption } from "./types.ts";

export function questionForStep(
  step: IntakeStep,
  data: IntakeCollectedData,
  vehicles: IntakeVehicleOption[],
) {
  const questions: Record<IntakeStep, string> = {
    welcome:
      "Olá! Sou o atendimento automatizado da VERAH. Vou fazer perguntas objetivas para organizar seu pedido, sem realizar diagnóstico.",
    customer_name: "Para começar, como você gostaria de ser chamada?",
    vehicle_choice: vehicleChoiceQuestion(vehicles),
    vehicle_brand: "Qual é a marca do veículo?",
    vehicle_model: "Qual é o modelo do veículo?",
    vehicle_year: "Qual é o ano do veículo? Informe quatro dígitos.",
    vehicle_plate:
      "Qual é a placa? Ela é opcional — responda “pular” se preferir não informar.",
    mileage: "Qual é a quilometragem aproximada do veículo? Use apenas números.",
    symptom: "Conte em uma frase qual é o principal sintoma percebido.",
    conditions: "Em quais condições o sintoma aparece? Por exemplo: ao ligar, frear, acelerar ou com o motor quente.",
    frequency: "Com que frequência isso acontece?",
    dashboard_lights: "Alguma luz acendeu no painel? Se não, responda “nenhuma”.",
    operating_condition:
      "O veículo está funcionando normalmente, com limitação ou está imobilizado?",
    urgency:
      "Como você percebe a urgência: baixa, média, alta ou crítica?",
    location: "Em qual cidade o veículo está agora?",
    confirmation: confirmationQuestion(data),
    completed: "Seu atendimento já foi criado e seguirá para revisão do Concierge VERAH.",
  };
  return questions[step];
}

export function invalidAnswer(step: IntakeStep) {
  return `Não consegui validar essa resposta. ${questionForStep(step, {}, [])}`;
}

export function resumedQuestion(
  step: IntakeStep,
  data: IntakeCollectedData,
  vehicles: IntakeVehicleOption[],
) {
  return `Vamos retomar de onde paramos. ${questionForStep(step, data, vehicles)}`;
}

function vehicleChoiceQuestion(vehicles: IntakeVehicleOption[]) {
  if (!vehicles.length) {
    return "Vamos cadastrar o veículo. Qual é a marca?";
  }
  const options = vehicles
    .map(
      (vehicle, index) =>
        `${index + 1}. ${vehicle.brand} ${vehicle.model}${vehicle.year ? ` ${vehicle.year}` : ""}`,
    )
    .join("\n");
  return `Qual veículo precisa de atendimento? Responda o número ou “novo”.\n${options}`;
}

function confirmationQuestion(data: IntakeCollectedData) {
  const vehicle = data.vehicle;
  return [
    "Confira os dados:",
    `Veículo: ${vehicle?.brand ?? "-"} ${vehicle?.model ?? "-"}${vehicle?.year ? ` ${vehicle.year}` : ""}`,
    `Quilometragem: ${data.mileage?.toLocaleString("pt-BR") ?? "-"} km`,
    `Sintoma: ${data.symptom ?? "-"}`,
    `Quando ocorre: ${data.conditions ?? "-"}`,
    `Urgência percebida: ${data.urgency ?? "-"}`,
    "Responda “sim” para criar o atendimento ou “não” para revisar o sintoma.",
  ].join("\n");
}
