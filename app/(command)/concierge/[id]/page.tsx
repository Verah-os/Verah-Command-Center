import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { acceptServiceRequest } from "@/services/concierge";
import { getConciergeServiceRequest } from "@/services/service-requests";
import { createSupabaseServerClient } from "@/services/supabase/server";
import {
  getActiveProvider,
  listActiveProvidersWithPortal,
} from "@/services/service-providers";
import { getQuoteForRequest } from "@/services/service-quotes";
import { conciergeConfirm } from "@/services/service-completion";
import type { ServiceProvider } from "@/types/service-provider";
import { ProviderAssignmentForm } from "@/components/concierge/provider-assignment-form";
import {
  buildConciergeChecklist,
  buildTimeline,
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
    error?: string;
  }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
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
  const quote = await getQuoteForRequest(id);
  const timelineEvents = buildTimeline(request, quote);
  const checklist = buildConciergeChecklist(request, quote);
  const canReassign = Boolean(
    assignedProvider &&
    ["prestador_indicado", "aguardando_aprovacao"].includes(
      request.serviceStage,
    ) &&
    !quote?.submittedAt &&
    quote?.status !== "approved",
  );
  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <Link
            href={"/concierge" as Route}
            className="text-sm text-primary hover:underline"
          >
            ← Voltar ao Concierge
          </Link>
          <p className="mt-3 font-mono text-sm font-semibold text-primary">
            {request.referenceCode}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">
            {request.customerName} · {request.vehicleBrand}{" "}
            {request.vehicleModel}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Criado em {formatter.format(new Date(request.createdAt))}
          </p>
        </div>
        <span className="w-fit rounded-full bg-muted px-3 py-1.5 text-sm font-semibold capitalize">
          {request.serviceStage.replaceAll("_", " ")}
        </span>
      </header>
      {(feedback.accepted ||
        feedback.providerAssigned ||
        feedback.providerReassigned) && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          {feedback.providerReassigned
            ? "Prestador alterado com sucesso."
            : feedback.providerAssigned
              ? "Prestador indicado com sucesso."
              : "Atendimento assumido com sucesso. A Work Order foi criada e a trigger encaminhou a criação do Dispatcher Job."}
        </p>
      )}
      {feedback.error && (
        <p className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {feedback.error}
        </p>
      )}
      <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
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
              <h2 className="font-semibold">Análise do Service Copilot</h2>
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
          <Card>
            <CardHeader>
              <h2 className="font-semibold">Assunção</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              {request.serviceStage === "solicitado" ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Ao assumir, o stage será atualizado e uma única Work Order
                    será criada atomicamente.
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
              <CardContent>
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
    <Card>
      <CardHeader>
        <h2 className="font-semibold">Checklist do Concierge</h2>
        <p className="text-sm text-muted-foreground">
          {completed} de {items.length} etapas verificadas
        </p>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.label} className="flex items-center gap-3 text-sm">
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
    <Card>
      <CardHeader>
        <h2 className="font-semibold">Timeline do atendimento</h2>
      </CardHeader>
      <CardContent>
        <ol className="space-y-0">
          {events.map((event, index) => (
            <li
              key={`${event.timestamp}-${event.order}`}
              className="relative flex gap-3 pb-6 last:pb-0"
            >
              <span
                aria-hidden="true"
                className="relative z-10 mt-1 h-3 w-3 shrink-0 rounded-full bg-primary"
              />
              {index < events.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute left-[5px] top-3 h-full w-px bg-border"
                />
              )}
              <div className="min-w-0">
                <p className="font-medium">{event.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {event.description}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
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
