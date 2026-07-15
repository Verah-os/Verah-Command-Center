import Link from "next/link";
import { notFound } from "next/navigation";
import type { Route } from "next";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  acceptServiceRequest,
  cancelServiceRequest,
  reopenServiceRequest,
  setServiceRequestPriority,
} from "@/services/concierge";
import { getConciergeServiceRequest } from "@/services/service-requests";
import { requireRole } from "@/services/auth/profile";
import {
  getActiveProvider,
  listActiveProvidersWithPortal,
} from "@/services/service-providers";
import { getQuoteForRequest } from "@/services/service-quotes";
import { conciergeConfirm } from "@/services/service-completion";
import type { ServiceProvider } from "@/types/service-provider";
import type { ServiceRequest } from "@/types/service-request";
import { ProviderAssignmentForm } from "@/components/concierge/provider-assignment-form";
import { ProviderTrustPanel } from "@/components/concierge/provider-trust-panel";
import {
  buildConciergeChecklist,
  buildTimeline,
  getSla,
  type TimelineEvent,
} from "@/lib/concierge-operations";

const formatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

export default async function ConciergeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    accepted?: string;
    providerAssigned?: string;
    providerReassigned?: string;
    created?: string;
    priorityUpdated?: string;
    cancelled?: string;
    reopened?: string;
    error?: string;
  }>;
}) {
  const profile = await requireRole(["concierge", "admin"]);
  const { id } = await params;
  const feedback = await searchParams;
  const request = await getConciergeServiceRequest(id);
  if (!request) notFound();
  const providers = (await listActiveProvidersWithPortal()).sort(
    (a, b) =>
      Number(Boolean(b.portalActive)) - Number(Boolean(a.portalActive)) ||
      Number(b.city.toLowerCase() === request.city.toLowerCase()) -
        Number(a.city.toLowerCase() === request.city.toLowerCase()) ||
      Number(b.specialties.includes(request.probableCategory ?? "")) -
        Number(a.specialties.includes(request.probableCategory ?? "")) ||
      (b.rating ?? 0) - (a.rating ?? 0) ||
      a.name.localeCompare(b.name, "pt-BR"),
  );
  const answeredQuestions = request.copilotQuestions.filter((question) =>
    Boolean(request.copilotAnswers[question]?.trim()),
  );
  const pendingQuestions = request.copilotQuestions.filter(
    (question) => !request.copilotAnswers[question]?.trim(),
  );
  const answeredCount = answeredQuestions.length;
  const pendingCount = pendingQuestions.length;
  const assignedProvider = request.providerId
    ? await getActiveProvider(request.providerId)
    : null;
  const trustProvider = assignedProvider
    ? providers.find((provider) => provider.id === assignedProvider.id) ??
      assignedProvider
    : providers[0] ?? null;
  const quote = await getQuoteForRequest(id);
  const timelineEvents = buildTimeline(request, quote);
  const checklist = buildConciergeChecklist(request, quote);
  const sla = getSla(request, quote);
  const canReassign = Boolean(
    assignedProvider &&
    ["prestador_indicado", "aguardando_aprovacao"].includes(
      request.serviceStage,
    ) &&
    !quote?.submittedAt &&
    quote?.status !== "approved",
  );
  const canChangePriority =
    profile.role === "admin" ||
    !["concluido", "cancelado"].includes(request.serviceStage);
  const canCancel =
    !["concluido", "cancelado"].includes(request.serviceStage) &&
    !["submitted", "approved", "clarification_requested"].includes(
      quote?.status ?? "",
    );
  return (
    <div className="space-y-6">
      <header className="rounded-[1.5rem] border border-rose-100 bg-white/95 p-5 shadow-[0_18px_45px_rgba(64,83,80,0.06)] sm:p-7">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <Link
            href={"/concierge" as Route}
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-teal-800 outline-none hover:underline focus-visible:ring-4 focus-visible:ring-teal-100"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar aos atendimentos
          </Link>
          <p className="mt-3 font-mono text-sm font-semibold text-primary">
            {request.referenceCode}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {request.customerName} · {request.vehicleBrand}{" "}
            {request.vehicleModel}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Criado em {formatter.format(new Date(request.createdAt))}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <CaseBadge label={naturalLabel(request.perceivedUrgency)} kind={request.perceivedUrgency} />
            <CaseBadge label={naturalLabel(request.serviceStage)} kind={request.serviceStage === "cancelado" ? "neutral" : request.serviceStage === "concluido" ? "success" : "stage"} />
            {request.isPriority && <CaseBadge label="Prioritário" kind="priority" />}
          </div>
        </div>
        <div className={`w-full rounded-2xl border p-4 md:w-auto md:min-w-48 ${sla.level === "atrasado" ? "border-red-200 bg-red-50" : sla.level === "atencao" ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-600"><Clock3 className="h-4 w-4" aria-hidden="true" /> Tempo de espera</p>
          <p className="mt-2 font-semibold text-slate-900">{sla.label}</p>
          <p className="mt-1 text-xs text-slate-600">Situação: {naturalLabel(sla.level)}</p>
        </div>
        </div>
      </header>
      {(feedback.accepted ||
        feedback.providerAssigned ||
        feedback.providerReassigned ||
        feedback.created ||
        feedback.priorityUpdated ||
        feedback.cancelled ||
        feedback.reopened) && (
        <p role="status" className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
          {feedback.created
            ? "Atendimento criado com sucesso. Nenhuma conta de cliente foi criada automaticamente."
            : feedback.cancelled
              ? "Atendimento cancelado com sucesso."
              : feedback.reopened
                ? "Atendimento reaberto e devolvido ao fluxo operacional."
                : feedback.priorityUpdated
                  ? "Prioridade atualizada com sucesso."
                  : feedback.providerReassigned
                    ? "Prestador alterado com sucesso."
                    : feedback.providerAssigned
                      ? "Prestador indicado com sucesso."
                      : "Atendimento assumido com sucesso e pronto para os próximos passos."}
          </span>
        </p>
      )}
      {feedback.error && (
        <p role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {feedback.error}
        </p>
      )}
      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <h2 className="font-semibold">Cliente e veículo</h2>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Info label="Cliente" value={request.customerName} />
              <Info
                label="Telefone"
                value={request.customerPhone ?? "Não informado"}
              />
              <Info
                label="Veículo"
                value={`${request.vehicleBrand} ${request.vehicleModel}${request.vehicleYear ? ` · ${request.vehicleYear}` : ""}`}
              />
              <Info
                label="Placa"
                value={request.vehiclePlate ?? "Não informada"}
              />
              <Info label="Cidade" value={request.city} />
              <Info
                label="Seguro"
                value={insuranceLabel(request.hasInsurance)}
              />
              {request.hasInsurance === "yes" && request.insurerName && (
                <Info label="Seguradora" value={request.insurerName} />
              )}
              <Info
                label="Assistência 24 horas"
                value={insuranceLabel(request.hasRoadsideAssistance)}
              />
              <div className="md:col-span-2">
                <Info label="Relato original" value={request.customerReport} />
              </div>
            </CardContent>
          </Card>
          {request.copilotQuestions.length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="font-semibold">Respostas da cliente</h2>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <p className="rounded bg-emerald-50 p-3">
                    <strong>
                      {answeredCount}
                    </strong>{" "}
                    respondidas
                  </p>
                  <p className="rounded bg-amber-50 p-3">
                    <strong>
                      {pendingCount}
                    </strong>{" "}
                    pendentes
                  </p>
                </div>
                {request.customerAnswersSubmittedAt && (
                  <p className="text-xs text-muted-foreground">
                    Última resposta em{" "}
                    {formatter.format(
                      new Date(request.customerAnswersSubmittedAt),
                    )}
                  </p>
                )}
                {answeredQuestions.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold">
                      Respostas recebidas
                    </h3>
                    <dl className="mt-3 space-y-3">
                      {answeredQuestions.map((question) => (
                        <div key={question} className="rounded-md border p-3">
                          <dt className="text-sm font-semibold">{question}</dt>
                          <dd className="mt-2 text-sm text-muted-foreground">
                            {request.copilotAnswers[question]}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
                <div>
                  <h3 className="text-sm font-semibold">
                    Perguntas pendentes
                  </h3>
                  {pendingQuestions.length ? (
                    <ul className="mt-3 space-y-3">
                      {pendingQuestions.map((question) => (
                        <li
                          key={question}
                          className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm"
                        >
                          {question}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                      Todas as informações complementares foram respondidas.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">Recomendação VERAH</p>
              <h2 className="mt-1 font-semibold">Resumo e triagem</h2>
            </CardHeader>
            <CardContent className="space-y-5">
              <Info label="Urgência" value={request.perceivedUrgency} />
              <Info
                label="Resumo"
                value={request.copilotSummary ?? "Não informado"}
              />
              <List
                label="Sinais de risco"
                items={request.copilotRiskSignals}
              />
              <List
                label="Informações ainda necessárias"
                items={pendingQuestions}
                empty="Todas as informações complementares foram respondidas."
              />
              <Info
                label="Briefing para Concierge"
                value={request.copilotConciergeBrief ?? "Não informado"}
              />
            </CardContent>
          </Card>
          {quote && (
            <Card>
              <CardHeader>
                <h2 className="font-semibold">Orçamento</h2>
              </CardHeader>
              <CardContent className="space-y-3">
                <Info
                  label="Status"
                  value={quote.status.replaceAll("_", " ")}
                />
                {quote.items.map((i) => (
                  <p key={i.id} className="text-sm">
                    {i.description}:{" "}
                    {i.totalPrice.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </p>
                ))}
                <p className="font-semibold">
                  Total:{" "}
                  {quote.totalAmount.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </p>
                <Info
                  label="Prazo"
                  value={quote.estimatedDuration ?? "Não informado"}
                />
                <Info
                  label="Garantia"
                  value={quote.warrantyText ?? "Não informada"}
                />
                {quote.customerDecisionNote && (
                  <Info
                    label="Decisão da cliente"
                    value={quote.customerDecisionNote}
                  />
                )}
              </CardContent>
            </Card>
          )}
        </div>
        <div className="space-y-5">
          <LifecycleActions
            request={request}
            canChangePriority={canChangePriority}
            canCancel={canCancel}
            quoteStatus={quote?.status ?? null}
          />
          <Card>
            <CardHeader>
              <h2 className="font-semibold">Assunção</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              {request.serviceStage === "solicitado" ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Ao assumir, o atendimento entra em análise e fica pronto
                    para os próximos passos da operação.
                  </p>
                  <form action={acceptServiceRequest}>
                    <input
                      type="hidden"
                      name="serviceRequestId"
                      value={request.id}
                    />
                    <Button className="h-11 w-full">Assumir atendimento</Button>
                  </form>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Atendimento assumido
                    {request.conciergeAcceptedAt
                      ? ` em ${formatter.format(new Date(request.conciergeAcceptedAt))}`
                      : ""}
                    .
                  </p>
                </>
              )}
            </CardContent>
          </Card>
          {(request.serviceStage === "concierge_aceitou" ||
            assignedProvider) && (
            <Card>
              <CardHeader>
                <h2 className="font-semibold">Indicar prestador</h2>
              </CardHeader>
              <CardContent className="space-y-4">
                {trustProvider && (
                  <ProviderTrustPanel
                    provider={trustProvider}
                    requestCity={request.city}
                    probableCategory={request.probableCategory}
                    reason={providerReason(trustProvider, request.city, request.probableCategory)}
                  />
                )}
                {assignedProvider ? (
                  <div className="space-y-2 text-sm">
                    <p className="font-semibold">{assignedProvider.name}</p>
                    <p>
                      {assignedProvider.city} ·{" "}
                      {assignedProvider.specialties.join(", ")}
                    </p>
                    <p className="text-muted-foreground">
                      Indicado em{" "}
                      {request.providerAssignedAt
                        ? formatter.format(new Date(request.providerAssignedAt))
                        : "—"}
                    </p>
                    <p>
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${providers.find((provider) => provider.id === assignedProvider.id)?.portalActive ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}
                      >
                        {providers.find(
                          (provider) => provider.id === assignedProvider.id,
                        )?.portalActive
                          ? "Portal ativo"
                          : "Sem acesso ao portal"}
                      </span>
                    </p>
                    {request.providerReassignedAt && (
                      <div className="rounded-md bg-muted p-3">
                        <p>
                          Alterado em{" "}
                          {formatter.format(
                            new Date(request.providerReassignedAt),
                          )}
                        </p>
                        <p className="mt-1">
                          Motivo: {request.providerReassignmentReason}
                        </p>
                      </div>
                    )}
                    {canReassign && (
                      <details className="pt-3">
                        <summary className="cursor-pointer font-semibold text-primary">
                          Alterar prestador
                        </summary>
                        <div className="mt-4">
                          <ProviderAssignmentForm
                            requestId={request.id}
                            providers={providers}
                            currentProviderId={assignedProvider.id}
                            mode="reassign"
                            requestCity={request.city}
                            probableCategory={request.probableCategory}
                          />
                        </div>
                      </details>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {!providers.length && (
                      <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                        Nenhum prestador ativo está disponível no momento.
                        Verifique o cadastro operacional e tente novamente.
                      </p>
                    )}
                    {providers[0] && (
                      <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
                        <p className="text-sm font-semibold">
                          1º recomendado: {providers[0].name}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {providerReason(
                            providers[0],
                            request.city,
                            request.probableCategory,
                          )}
                        </p>
                      </div>
                    )}
                    <ProviderAssignmentForm
                      requestId={request.id}
                      providers={providers}
                      mode="assign"
                      requestCity={request.city}
                      probableCategory={request.probableCategory}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          {request.providerCompletedAt && (
            <Card>
              <CardHeader>
                <h2 className="font-semibold">Conclusão do serviço</h2>
              </CardHeader>
              <CardContent className="space-y-3">
                <Info
                  label="Finalizado pelo prestador"
                  value={formatter.format(
                    new Date(request.providerCompletedAt),
                  )}
                />
                <Info
                  label="Observações finais"
                  value={request.completionNotes ?? "Sem observações"}
                />
                {request.serviceStage === "em_execucao" &&
                !request.conciergeConfirmedAt ? (
                  <form action={conciergeConfirm}>
                    <input type="hidden" name="requestId" value={request.id} />
                    <Button className="w-full">Confirmar conclusão</Button>
                  </form>
                ) : (
                  <p className="rounded bg-emerald-50 p-3 text-sm text-emerald-900">
                    Conclusão confirmada.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
          <ConciergeChecklist items={checklist} />
          <Timeline events={timelineEvents} />
        </div>
      </div>
    </div>
  );
}

function LifecycleActions({
  request,
  canChangePriority,
  canCancel,
  quoteStatus,
}: {
  request: ServiceRequest;
  canChangePriority: boolean;
  canCancel: boolean;
  quoteStatus: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold">Ações operacionais</h2>
      </CardHeader>
      <CardContent className="space-y-4">
        {request.isPriority && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="font-semibold">Atendimento prioritário</p>
            <p className="mt-1">Motivo: {request.priorityReason}</p>
          </div>
        )}

        {canChangePriority &&
          (request.isPriority ? (
            <form action={setServiceRequestPriority}>
              <input type="hidden" name="serviceRequestId" value={request.id} />
              <input type="hidden" name="isPriority" value="false" />
              <Button variant="secondary" className="w-full">
                Remover prioridade
              </Button>
            </form>
          ) : (
            <details className="rounded-xl border border-rose-100 p-4">
              <summary className="min-h-11 cursor-pointer text-sm font-semibold text-teal-800 outline-none focus-visible:ring-4 focus-visible:ring-teal-100">
                Marcar como prioridade
              </summary>
              <form action={setServiceRequestPriority} className="mt-4 space-y-3">
                <input type="hidden" name="serviceRequestId" value={request.id} />
                <input type="hidden" name="isPriority" value="true" />
                <label className="block text-sm font-semibold">
                  Motivo da prioridade
                  <textarea
                    name="reason"
                    required
                    className="mt-2 min-h-24 w-full rounded-xl border border-rose-100 p-3 font-normal outline-none focus-visible:border-teal-500 focus-visible:ring-4 focus-visible:ring-teal-100"
                  />
                </label>
                <Button className="w-full">Confirmar prioridade</Button>
              </form>
            </details>
          ))}

        {canCancel && (
          <details className="rounded-xl border border-red-200 p-4">
            <summary className="min-h-11 cursor-pointer text-sm font-semibold text-red-700 outline-none focus-visible:ring-4 focus-visible:ring-red-100">
              Cancelar atendimento
            </summary>
            <form action={cancelServiceRequest} className="mt-4 space-y-3">
              <input type="hidden" name="serviceRequestId" value={request.id} />
              <label className="block text-sm font-semibold">
                Motivo
                <select
                  name="reason"
                  required
                  className="mt-2 h-11 w-full rounded-xl border border-rose-100 bg-white px-3 font-normal outline-none focus-visible:border-teal-500 focus-visible:ring-4 focus-visible:ring-teal-100"
                >
                  <option value="">Selecione</option>
                  <option value="customer_withdrew">Cliente desistiu</option>
                  <option value="duplicate">Atendimento duplicado</option>
                  <option value="no_response">Sem resposta</option>
                  <option value="resolved_without_service">
                    Resolvido sem serviço
                  </option>
                  <option value="provider_unavailable">
                    Prestador indisponível
                  </option>
                  <option value="invalid_request">Solicitação inválida</option>
                  <option value="operational_failure">Falha operacional</option>
                  <option value="other">Outro</option>
                </select>
              </label>
              <label className="block text-sm font-semibold">
                Observação
                <textarea
                  name="notes"
                  className="mt-2 min-h-24 w-full rounded-xl border border-rose-100 p-3 font-normal outline-none focus-visible:border-teal-500 focus-visible:ring-4 focus-visible:ring-teal-100"
                  placeholder="Obrigatória quando o motivo for Outro"
                />
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="confirmation"
                  value="confirmed"
                  required
                  className="mt-1"
                />
                Confirmo que desejo cancelar este atendimento.
              </label>
              <Button className="w-full bg-red-700 hover:bg-red-800">
                Confirmar cancelamento
              </Button>
            </form>
          </details>
        )}

        {!canCancel &&
          !["concluido", "cancelado"].includes(request.serviceStage) &&
          ["submitted", "approved", "clarification_requested"].includes(
            quoteStatus ?? "",
          ) && (
            <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
              O cancelamento está bloqueado porque o orçamento já foi enviado
              ou aprovado.
            </p>
          )}

        {request.serviceStage === "cancelado" && (
          <>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <p className="font-semibold">Atendimento cancelado</p>
              <p className="mt-1">
                Motivo: {cancellationReasonLabel(request.cancellationReason)}
              </p>
              {request.cancellationNotes && (
                <p className="mt-1">Observação: {request.cancellationNotes}</p>
              )}
            </div>
            <details className="rounded-xl border border-rose-100 p-4">
              <summary className="min-h-11 cursor-pointer text-sm font-semibold text-teal-800 outline-none focus-visible:ring-4 focus-visible:ring-teal-100">
                Reabrir atendimento
              </summary>
              <form action={reopenServiceRequest} className="mt-4 space-y-3">
                <input type="hidden" name="serviceRequestId" value={request.id} />
                <label className="block text-sm font-semibold">
                  Motivo da reabertura
                  <textarea
                    name="reason"
                    required
                    className="mt-2 min-h-24 w-full rounded-xl border border-rose-100 p-3 font-normal outline-none focus-visible:border-teal-500 focus-visible:ring-4 focus-visible:ring-teal-100"
                  />
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="confirmation"
                    value="confirmed"
                    required
                    className="mt-1"
                  />
                  Confirmo que desejo devolver o atendimento ao fluxo.
                </label>
                <Button className="w-full">Confirmar reabertura</Button>
              </form>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function cancellationReasonLabel(reason: string | null) {
  const labels: Record<string, string> = {
    customer_withdrew: "Cliente desistiu",
    duplicate: "Atendimento duplicado",
    no_response: "Sem resposta",
    resolved_without_service: "Resolvido sem serviço",
    provider_unavailable: "Prestador indisponível",
    invalid_request: "Solicitação inválida",
    operational_failure: "Falha operacional",
    other: "Outro",
  };
  return reason ? labels[reason] ?? "Motivo operacional" : "Não informado";
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{value}</p>
    </div>
  );
}
function List({
  label,
  items,
  empty = "Nenhum item identificado.",
}: {
  label: string;
  items: string[];
  empty?: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <ul className="mt-2 space-y-1 text-sm">
        {items.length ? (
          items.map((item) => <li key={item}>• {item}</li>)
        ) : (
          <li className="text-muted-foreground">{empty}</li>
        )}
      </ul>
    </div>
  );
}

function insuranceLabel(value: "yes" | "no" | "unknown") {
  return value === "yes" ? "Sim" : value === "no" ? "Não" : "Não sei";
}
function ConciergeChecklist({
  items,
}: {
  items: Array<{ label: string; complete: boolean }>;
}) {
  const completed = items.filter((item) => item.complete).length;
  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-rose-50/50">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-rose-700">Acompanhamento</p>
        <h2 className="mt-1 font-semibold">Checklist do Concierge</h2>
        <p className="text-sm text-muted-foreground">
          {completed} de {items.length} etapas verificadas
        </p>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          {items.map((item) => (
            <li key={item.label} className={`flex items-center gap-3 rounded-xl border p-3 text-sm ${item.complete ? "border-emerald-100 bg-emerald-50/70" : "border-slate-100 bg-slate-50"}`}>
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold ${item.complete ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-border bg-muted text-muted-foreground"}`}
              >
                {item.complete ? "✓" : "–"}
              </span>
              <span className={item.complete ? "font-medium" : "text-muted-foreground"}>
                <span className="sr-only">
                  {item.complete ? "Concluído: " : "Pendente: "}
                </span>
                {item.label}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-teal-50/50">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">Histórico operacional</p>
        <h2 className="mt-1 font-semibold">Timeline do atendimento</h2>
      </CardHeader>
      <CardContent>
        <ol className="space-y-0">
          {events.map((event, index) => (
            <li
              key={`${event.timestamp}-${event.order}`}
              className="relative flex gap-4 pb-7 last:pb-0"
            >
              <span
                aria-hidden="true"
                className="relative z-10 mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-4 border-teal-100 bg-teal-700"
              />
              {index < events.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute left-[9px] top-5 h-full w-px bg-teal-100"
                />
              )}
              <div className="min-w-0">
                <p className="font-semibold text-slate-800">{event.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {event.description}
                </p>
                <p className="mt-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 font-mono text-[11px] text-slate-600">
                  {formatter.format(new Date(event.timestamp))}
                  {event.actor ? ` · ${event.actor}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function providerReason(
  provider: ServiceProvider,
  city: string,
  category: string | null,
) {
  const sameCity = provider.city.toLowerCase() === city.toLowerCase();
  const compatible = Boolean(
    category && provider.specialties.includes(category),
  );
  const reasons = [
    provider.portalActive ? "possuir portal ativo" : null,
    sameCity ? `atender em ${city}` : null,
    compatible
      ? `possuir especialidade compatível com ${category?.replaceAll("_", " ")}`
      : null,
    provider.rating !== null
      ? `ter avaliação ${provider.rating.toFixed(1)}`
      : null,
  ].filter(Boolean);
  return reasons.length
    ? `Recomendado por ${reasons.join(" e ")}.`
    : "Primeiro prestador ativo na ordem recomendada.";
}

type CaseBadgeKind = "priority" | "critica" | "alta" | "media" | "baixa" | "success" | "neutral" | "stage";

function CaseBadge({ label, kind }: { label: string; kind: CaseBadgeKind }) {
  const styles: Record<CaseBadgeKind, string> = {
    priority: "border-violet-200 bg-violet-50 text-violet-800",
    critica: "border-red-200 bg-red-50 text-red-800",
    alta: "border-orange-200 bg-orange-50 text-orange-800",
    media: "border-amber-200 bg-amber-50 text-amber-800",
    baixa: "border-emerald-200 bg-emerald-50 text-emerald-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    neutral: "border-slate-200 bg-slate-100 text-slate-600",
    stage: "border-teal-100 bg-teal-50 text-teal-800",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${styles[kind]}`}>
      {kind === "priority" && <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />}
      {kind === "critica" && <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
      {label}
    </span>
  );
}

function naturalLabel(value: string) {
  const label = value.replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}
