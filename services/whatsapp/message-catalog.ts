export const WHATSAPP_MESSAGE_CATALOG = {
  intake_acknowledgement: message("Confirmar que a VERAH recebeu o relato", [], false),
  information_needed: message("Solicitar informação necessária", ["requested_information"], false),
  quote_available: message("Avisar que o orçamento está disponível", ["service_reference"], true),
  approval_request: message("Solicitar decisão explícita da cliente", ["service_reference"], true),
  vehicle_status: message("Atualizar marco do atendimento", ["service_reference", "status"], true),
  pickup_scheduled: message("Confirmar retirada programada", ["service_reference", "window"], true),
  provider_dropoff: message("Confirmar entrega ao prestador", ["service_reference"], true),
  service_completed: message("Informar conclusão revisada", ["service_reference"], true),
  return_scheduled: message("Confirmar devolução programada", ["service_reference", "window"], true),
  incident_human_contact: {
    ...message("Solicitar contato humano em incidente", ["service_reference"], true),
    allowedOrigins: ["human"] as const,
  },
} as const;

function message(purpose: string, requiredVariables: string[], requiresService: boolean) {
  return {
    purpose,
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
  if (template.requiredVariables.some((name) => !hasSafeValue(input.variables[name]))) {
    return "missing_template_variable";
  }
  return null;
}

function hasSafeValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 500;
}
