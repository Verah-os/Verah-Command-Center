export const WHATSAPP_MESSAGE_CATALOG = {
  intake_acknowledgement: message("Confirmar que a VERAH recebeu o relato", "Recebemos seu relato. A VERAH vai cuidar disso com você.", [], false),
  information_needed: message("Solicitar informação necessária", "Para continuar, precisamos desta informação: {{requested_information}}.", ["requested_information"], false),
  quote_available: message("Avisar que o orçamento está disponível", "O orçamento do atendimento {{service_reference}} está disponível para sua revisão.", ["service_reference"], true),
  approval_request: message("Solicitar decisão explícita da cliente", "Precisamos da sua decisão explícita sobre o atendimento {{service_reference}}.", ["service_reference"], true),
  vehicle_status: message("Atualizar marco do atendimento", "Atualização do atendimento {{service_reference}}: {{status}}.", ["service_reference", "status"], true),
  pickup_scheduled: message("Confirmar retirada programada", "A retirada do atendimento {{service_reference}} está programada para {{window}}.", ["service_reference", "window"], true),
  provider_dropoff: message("Confirmar entrega ao prestador", "O veículo do atendimento {{service_reference}} foi entregue ao prestador.", ["service_reference"], true),
  service_completed: message("Informar conclusão revisada", "O serviço do atendimento {{service_reference}} foi concluído e revisado pela VERAH.", ["service_reference"], true),
  return_scheduled: message("Confirmar devolução programada", "A devolução do atendimento {{service_reference}} está programada para {{window}}.", ["service_reference", "window"], true),
  incident_human_contact: {
    ...message("Solicitar contato humano em incidente", "Precisamos falar com você sobre o atendimento {{service_reference}}. Uma pessoa da VERAH fará o contato.", ["service_reference"], true),
    allowedOrigins: ["human"] as const,
  },
} as const;

function message(purpose: string, bodyTemplate: string, requiredVariables: string[], requiresService: boolean) {
  return {
    purpose,
    bodyTemplate,
    requiredVariables,
    allowedAudience: "customer" as const,
    sensitiveDataRules: "No diagnosis, credentials, payment-card data, documents, or private evidence URLs.",
    allowedOrigins: ["human", "system"] as const,
    requiresService,
  };
}

export type WhatsAppTemplateKey = keyof typeof WHATSAPP_MESSAGE_CATALOG;
export type WhatsAppMessageBasis = "transactional" | "consent";
export type WhatsAppMessageOrigin = "human" | "system" | "agent_proposal";

export function validateWhatsAppMessageProposal(input: {
  templateKey: string;
  variables: Record<string, unknown>;
  origin: WhatsAppMessageOrigin;
}) {
  const template = WHATSAPP_MESSAGE_CATALOG[input.templateKey as WhatsAppTemplateKey];
  if (!template) return "unknown_template";
  if (input.origin === "agent_proposal") return "agent_cannot_enqueue";
  if (!(template.allowedOrigins as readonly string[]).includes(input.origin)) return "origin_not_allowed";
  if (Object.keys(input.variables).some((name) => !(template.requiredVariables as readonly string[]).includes(name))) {
    return "unexpected_template_variable";
  }
  if (template.requiredVariables.some((name) => !hasSafeValue(input.variables[name]))) {
    return "missing_template_variable";
  }
  if (Object.values(input.variables).some((value) => containsSensitiveData(String(value)))) {
    return "sensitive_template_variable";
  }
  return null;
}

export function renderWhatsAppTemplate(
  templateKey: string,
  variables: Record<string, unknown>,
) {
  const template = WHATSAPP_MESSAGE_CATALOG[templateKey as WhatsAppTemplateKey];
  if (!template) return null;
  let body: string = template.bodyTemplate;
  for (const name of template.requiredVariables) {
    const value = variables[name];
    if (!hasSafeValue(value)) return null;
    body = body.replaceAll(`{{${name}}}`, String(value).trim());
  }
  return containsSensitiveData(body) ? null : body;
}

function hasSafeValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 500;
}

function containsSensitiveData(value: string) {
  return /(bearer|authorization|access[_-]?token|cvv|\bpan\b|\b[0-9]{16}\b|https?:\/\/[^\s]*service-attachments)/i.test(value);
}
