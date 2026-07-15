import type { ServiceQuoteTiming } from "@/services/service-quotes/service-quotes-service";
import type { ServiceProvider } from "@/types/service-provider";
import type { ServiceRequest } from "@/types/service-request";

export type ConciergeFilter =
  | "todos"
  | "novos"
  | "em_analise"
  | "aguardando_cliente"
  | "aguardando_prestador"
  | "aguardando_aprovacao"
  | "em_execucao"
  | "concluidos"
  | "cancelados"
  | "urgentes"
  | "revisao";

export type ConciergePeriod = "hoje" | "7_dias" | "todos";

export type ConciergeFilters = {
  filter: ConciergeFilter;
  city?: string;
  category?: string;
  urgency?: string;
  provider?: string;
  period: ConciergePeriod;
};

export type TimelineEvent = {
  timestamp: string;
  title: string;
  description: string;
  actor?: string;
  order: number;
};

export const SLA_ATTENTION_AFTER_MS = 2 * 60 * 60 * 1000;
export const SLA_OVERDUE_AFTER_MS = 8 * 60 * 60 * 1000;

export function pendingQuestionCount(request: ServiceRequest) {
  return request.copilotQuestions.filter(
    (question) => !request.copilotAnswers[question]?.trim(),
  ).length;
}

export function getRelevantTimestamp(
  request: ServiceRequest,
  quote?: ServiceQuoteTiming | null,
) {
  const stageTimestamp = (() => {
    switch (request.serviceStage) {
    case "solicitado":
      return request.createdAt;
    case "concierge_aceitou":
      return request.conciergeAcceptedAt ?? request.createdAt;
    case "prestador_indicado":
      return request.providerAssignedAt ?? request.updatedAt;
    case "aguardando_aprovacao":
      return quote?.submittedAt ?? request.updatedAt;
    case "em_execucao":
      return quote?.approvedAt ?? request.updatedAt;
    case "concluido":
      return request.completedAt ?? request.updatedAt;
    case "cancelado":
        return request.cancelledAt ?? request.updatedAt;
    }
  })();
  if (
    request.reopenedAt &&
    !["concluido", "cancelado"].includes(request.serviceStage) &&
    Date.parse(request.reopenedAt) > Date.parse(stageTimestamp)
  )
    return request.reopenedAt;
  return stageTimestamp;
}

export function getSla(
  request: ServiceRequest,
  quote?: ServiceQuoteTiming | null,
  now = new Date(),
) {
  const timestamp = getRelevantTimestamp(request, quote);
  const elapsedMs = Math.max(0, now.getTime() - Date.parse(timestamp));
  const level =
    elapsedMs >= SLA_OVERDUE_AFTER_MS
      ? "atrasado"
      : elapsedMs >= SLA_ATTENTION_AFTER_MS
        ? "atencao"
        : "normal";
  const prefix =
    request.serviceStage === "concluido"
      ? "Concluído há"
      : request.serviceStage === "cancelado"
        ? "Cancelado há"
        : "Aguardando há";
  return { timestamp, elapsedMs, level, label: `${prefix} ${elapsedLabel(elapsedMs)}` };
}

export function getOperationalIndicators(
  requests: ServiceRequest[],
  now = new Date(),
) {
  const today = saoPauloDateKey(now.toISOString());
  return {
    novos: requests.filter((request) => request.serviceStage === "solicitado")
      .length,
    emAnalise: requests.filter(
      (request) =>
        request.serviceStage === "concierge_aceitou" && !request.providerId,
    ).length,
    aguardandoCliente: requests.filter(
      (request) => pendingQuestionCount(request) > 0,
    ).length,
    aguardandoPrestador: requests.filter(
      (request) => request.serviceStage === "prestador_indicado",
    ).length,
    aguardandoAprovacao: requests.filter(
      (request) => request.serviceStage === "aguardando_aprovacao",
    ).length,
    emExecucao: requests.filter(
      (request) => request.serviceStage === "em_execucao",
    ).length,
    concluidosHoje: requests.filter(
      (request) =>
        request.serviceStage === "concluido" &&
        request.completedAt &&
        saoPauloDateKey(request.completedAt) === today,
    ).length,
    cancelados: requests.filter(
      (request) => request.serviceStage === "cancelado",
    ).length,
  };
}

export function filterAndSortRequests(
  requests: ServiceRequest[],
  filters: ConciergeFilters,
  quoteTimings: Map<string, ServiceQuoteTiming>,
  now = new Date(),
) {
  const cutoff =
    filters.period === "hoje"
      ? startOfSaoPauloDay(now)
      : filters.period === "7_dias"
        ? now.getTime() - 7 * 24 * 60 * 60 * 1000
        : null;
  return requests
    .filter((request) => matchesPrimaryFilter(request, filters.filter))
    .filter((request) => !filters.city || request.city === filters.city)
    .filter(
      (request) =>
        !filters.category || request.probableCategory === filters.category,
    )
    .filter(
      (request) =>
        !filters.urgency || request.perceivedUrgency === filters.urgency,
    )
    .filter(
      (request) => !filters.provider || request.providerId === filters.provider,
    )
    .filter((request) => cutoff === null || Date.parse(request.createdAt) >= cutoff)
    .sort((a, b) => {
      if (a.isPriority !== b.isPriority) return a.isPriority ? -1 : 1;
      const aTerminal = ["concluido", "cancelado"].includes(a.serviceStage);
      const bTerminal = ["concluido", "cancelado"].includes(b.serviceStage);
      if (aTerminal !== bTerminal) return aTerminal ? 1 : -1;
      if (aTerminal && bTerminal) {
        const aTimestamp =
          a.serviceStage === "concluido" ? a.completedAt ?? a.updatedAt : a.updatedAt;
        const bTimestamp =
          b.serviceStage === "concluido" ? b.completedAt ?? b.updatedAt : b.updatedAt;
        return Date.parse(bTimestamp) - Date.parse(aTimestamp);
      }
      const urgencyOrder = { critica: 0, alta: 1, media: 2, baixa: 3 };
      const urgencyDifference =
        urgencyOrder[a.perceivedUrgency] - urgencyOrder[b.perceivedUrgency];
      if (urgencyDifference) return urgencyDifference;
      const aWaiting = getSla(a, quoteTimings.get(a.id), now).elapsedMs;
      const bWaiting = getSla(b, quoteTimings.get(b.id), now).elapsedMs;
      return bWaiting - aWaiting || Date.parse(a.createdAt) - Date.parse(b.createdAt);
    });
}

export function buildTimeline(
  request: ServiceRequest,
  quote?: ServiceQuoteTiming | null,
): TimelineEvent[] {
  const events: Array<TimelineEvent | null> = [
    event(
      request.createdAt,
      request.origin === "concierge"
        ? "Atendimento criado pelo Concierge"
        : "Cliente abriu o atendimento",
      request.origin === "concierge"
        ? "Relato recebido e registrado manualmente pela operação."
        : "Relato e dados do veículo foram enviados.",
      request.origin === "concierge" ? "Concierge" : "Cliente",
      0,
    ),
    request.copilotSummary
      ? event(
          request.createdAt,
          "VERAH realizou triagem inicial",
          "Resumo, urgência e sinais de risco foram derivados do relato.",
          "VERAH",
          1,
        )
      : null,
    request.customerAnswersSubmittedAt
      ? event(
          request.customerAnswersSubmittedAt,
          "Cliente enviou informações complementares",
          `${request.copilotQuestions.length - pendingQuestionCount(request)} de ${request.copilotQuestions.length} perguntas respondidas.`,
          "Cliente",
          2,
        )
      : null,
    request.prioritySetAt ?? request.lastPrioritySetAt
      ? event(
          (request.prioritySetAt ?? request.lastPrioritySetAt)!,
          "Atendimento marcado como prioritário",
          request.priorityReason ||
            request.lastPriorityReason ||
            "Prioridade operacional definida.",
          "Concierge",
          3,
        )
      : null,
    request.priorityRemovedAt
      ? event(
          request.priorityRemovedAt,
          "Prioridade removida",
          "Atendimento voltou para a ordenação operacional padrão.",
          "Concierge",
          4,
        )
      : null,
    request.conciergeAcceptedAt
      ? event(
          request.conciergeAcceptedAt,
          "Concierge assumiu",
          "Atendimento entrou na operação da VERAH.",
          "Concierge",
          5,
        )
      : null,
    request.providerAssignedAt && !request.providerReassignedAt
      ? event(
          request.providerAssignedAt,
          "Prestador homologado foi indicado",
          "Atendimento encaminhado para preparação da proposta.",
          "Concierge",
          6,
        )
      : null,
    request.providerReassignedAt
      ? event(
          request.providerReassignedAt,
          "Prestador foi alterado",
          request.providerReassignmentReason || "Prestador reatribuído pela operação.",
          "Concierge",
          7,
        )
      : null,
    quote?.submittedAt
      ? event(
          quote.submittedAt,
          "Orçamento foi enviado",
          "Proposta disponibilizada para a cliente.",
          "Prestador",
          8,
        )
      : null,
    quote?.clarificationRequestedAt
      ? event(
          quote.clarificationRequestedAt,
          "Cliente solicitou esclarecimento",
          quote.customerDecisionNote || "Cliente pediu mais informações sobre a proposta.",
          "Cliente",
          9,
        )
      : null,
    quote?.approvedAt
      ? event(
          quote.approvedAt,
          "Cliente aprovou",
          "Execução autorizada pela cliente.",
          "Cliente",
          10,
        )
      : null,
    request.providerCompletedAt
      ? event(
          request.providerCompletedAt,
          "Prestador marcou serviço como finalizado",
          request.completionNotes || "Execução finalizada pelo prestador.",
          "Prestador",
          11,
        )
      : null,
    request.conciergeConfirmedAt
      ? event(
          request.conciergeConfirmedAt,
          "Concierge confirmou conclusão",
          "Conclusão validada pela operação.",
          "Concierge",
          12,
        )
      : null,
    request.customerRatedAt
      ? event(
          request.customerRatedAt,
          "Cliente avaliou",
          request.customerRating
            ? `Atendimento avaliado com nota ${request.customerRating} de 5.`
            : "Avaliação registrada.",
          "Cliente",
          13,
        )
      : null,
    request.lastCancelledAt
      ? event(
          request.lastCancelledAt,
          "Atendimento cancelado",
          request.lastCancellationReason
            ? `Motivo: ${cancellationReasonLabel(request.lastCancellationReason)}.`
            : "O atendimento foi encerrado como cancelado.",
          "Concierge",
          14,
        )
      : null,
    request.reopenedAt
      ? event(
          request.reopenedAt,
          "Atendimento reaberto",
          request.reopenReason || "Atendimento devolvido ao fluxo operacional.",
          "Concierge",
          15,
        )
      : null,
  ];
  return events
    .filter((item): item is TimelineEvent => item !== null)
    .sort(
      (a, b) =>
        Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.order - b.order,
    );
}

export function buildConciergeChecklist(
  request: ServiceRequest,
  quote?: ServiceQuoteTiming | null,
) {
  return [
    { label: "Relato revisado", complete: Boolean(request.conciergeAcceptedAt) },
    {
      label: "Informações complementares recebidas",
      complete: pendingQuestionCount(request) === 0,
    },
    {
      label: "Seguro/assistência conferidos",
      complete:
        request.hasInsurance !== "unknown" &&
        request.hasRoadsideAssistance !== "unknown",
    },
    { label: "Prestador indicado", complete: Boolean(request.providerId) },
    { label: "Orçamento enviado", complete: Boolean(quote?.submittedAt) },
    { label: "Cliente aprovou", complete: Boolean(quote?.approvedAt) },
    {
      label: "Serviço finalizado pelo prestador",
      complete: Boolean(request.providerCompletedAt),
    },
    {
      label: "Conclusão confirmada",
      complete: Boolean(request.conciergeConfirmedAt),
    },
  ];
}

export function providerName(
  providerId: string | null,
  providers: Map<string, ServiceProvider>,
) {
  return providerId ? providers.get(providerId)?.name ?? "Prestador ativo" : null;
}

function matchesPrimaryFilter(
  request: ServiceRequest,
  filter: ConciergeFilter,
) {
  switch (filter) {
    case "todos":
      return true;
    case "novos":
      return request.serviceStage === "solicitado";
    case "em_analise":
      return request.serviceStage === "concierge_aceitou" && !request.providerId;
    case "aguardando_cliente":
      return pendingQuestionCount(request) > 0;
    case "aguardando_prestador":
      return request.serviceStage === "prestador_indicado";
    case "aguardando_aprovacao":
      return request.serviceStage === "aguardando_aprovacao";
    case "em_execucao":
      return request.serviceStage === "em_execucao";
    case "concluidos":
      return request.serviceStage === "concluido";
    case "cancelados":
      return request.serviceStage === "cancelado";
    case "urgentes":
      return ["critica", "alta"].includes(request.perceivedUrgency);
    case "revisao":
      return request.requiresHumanReview;
  }
}

function event(
  timestamp: string,
  title: string,
  description: string,
  actor: string | undefined,
  order: number,
): TimelineEvent {
  return { timestamp, title, description, actor, order };
}

function elapsedLabel(elapsedMs: number) {
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "dia" : "dias"}`;
}

function cancellationReasonLabel(reason: string) {
  const labels: Record<string, string> = {
    customer_withdrew: "cliente desistiu",
    duplicate: "atendimento duplicado",
    no_response: "sem resposta",
    resolved_without_service: "resolvido sem serviço",
    provider_unavailable: "prestador indisponível",
    invalid_request: "solicitação inválida",
    operational_failure: "falha operacional",
    other: "outro",
  };
  return labels[reason] ?? "motivo operacional";
}

function saoPauloDateKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function startOfSaoPauloDay(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) =>
    Number(parts.find((item) => item.type === type)?.value ?? 0);
  return Date.UTC(part("year"), part("month") - 1, part("day"), 3);
}
