import { notFound, redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { DemoShell } from "@/components/demo/demo-shell";
import { getCustomerServiceRequest } from "@/services/service-requests";
import { createSupabaseServerClient } from "@/services/supabase/server";
import { getCustomerProviderProfile } from "@/services/service-providers";
import { decideQuote, getQuoteForRequest } from "@/services/service-quotes";
import { submitRating } from "@/services/service-completion";
import type { ServiceUrgency } from "@/services/service-copilot";
import { CustomerAnswersForm } from "@/components/demo/customer-answers-form";
import {
  customerJourneyStages,
  customerStageLabels,
} from "@/lib/customer-service-stage";

export default async function ServiceRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ answersSaved?: string; answersError?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const feedback = await searchParams;
  const request = await getCustomerServiceRequest(id);
  if (!request) notFound();
  const currentStage =
    request.serviceStage === "cancelado"
      ? -1
      : Math.max(0, customerJourneyStages.indexOf(request.serviceStage));
  const provider = request.providerId
    ? await getCustomerProviderProfile(request.providerId)
    : null;
  const quote = await getQuoteForRequest(id);
  const stageDates = [
    request.createdAt,
    request.conciergeAcceptedAt,
    request.providerAssignedAt,
    quote?.submittedAt ?? null,
    quote?.approvedAt ?? null,
    request.completedAt,
  ];
  return (
    <DemoShell>
      <section className="mx-auto max-w-4xl px-5 py-10 sm:py-14">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-sm font-semibold text-teal-800">
              {request.referenceCode}
            </p>
            <h1 className="mt-2 text-3xl font-semibold">
              {request.serviceStage === "cancelado"
                ? "Atendimento encerrado"
                : request.serviceStage === "concluido"
                ? "Seu atendimento foi concluído"
                : request.serviceStage === "solicitado"
                  ? "Seu atendimento foi solicitado"
                  : "Seu atendimento está em acompanhamento"}
            </h1>
          </div>
          <span className="w-fit rounded-full bg-teal-100 px-4 py-2 text-sm font-semibold text-teal-900">
            {customerStageLabels[request.serviceStage]}
          </span>
        </div>
        <div className="mt-8 grid gap-5 lg:grid-cols-[1.4fr_0.8fr]">
          <div className="space-y-5">
            {request.serviceStage === "cancelado" && (
              <Card className="border-slate-200 bg-slate-50">
                <CardContent className="p-6">
                  <h2 className="text-lg font-semibold">Atendimento encerrado</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Este atendimento foi encerrado pela equipe VERAH. Se precisar
                    de ajuda, entre em contato para receber orientação.
                  </p>
                </CardContent>
              </Card>
            )}
            {request.reopenedAt && request.serviceStage !== "cancelado" && (
              <Card className="border-teal-200 bg-teal-50">
                <CardContent className="p-6">
                  <h2 className="text-lg font-semibold">
                    Atendimento de volta para análise
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    A equipe VERAH retomou o acompanhamento e seguirá com os
                    próximos passos.
                  </p>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardContent className="space-y-5 p-6">
                <Info
                  label="Veículo"
                  value={`${request.vehicleBrand} ${request.vehicleModel}${request.vehicleYear ? ` · ${request.vehicleYear}` : ""}`}
                />
                <Info
                  label="Localização"
                  value={
                    request.state
                      ? `${request.city}/${request.state}`
                      : request.city
                  }
                />
                <UrgencyBadge urgency={request.perceivedUrgency} />
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
                <Info label="Seu relato" value={request.customerReport} />
              </CardContent>
            </Card>
            {request.copilotSummary && (
              <Card className="border-rose-100 bg-rose-50/60">
                <CardContent className="p-6">
                  <h2 className="text-lg font-semibold">Resumo da VERAH</h2>
                  <p className="mt-3 leading-7 text-slate-700">
                    {request.copilotSummary}
                  </p>
                </CardContent>
              </Card>
            )}
            {request.copilotQuestions.length > 0 && (
              <Card className="border-rose-200">
                <CardContent className="p-6">
                  <CustomerAnswersForm
                    requestId={request.id}
                    questions={request.copilotQuestions}
                    answers={request.copilotAnswers}
                    submittedAt={request.customerAnswersSubmittedAt}
                    answersSaved={feedback.answersSaved}
                    answersError={feedback.answersError}
                    locked={["concluido", "cancelado"].includes(
                      request.serviceStage,
                    )}
                  />
                </CardContent>
              </Card>
            )}
            {provider && (
              <Card className="border-teal-200 bg-teal-50">
                <CardContent className="space-y-3 p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold">
                      Prestador homologado VERAH
                    </h2>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-teal-800">
                      Rede homologada VERAH
                    </span>
                  </div>
                  <Info label="Cidade" value={provider.city} />
                  <Info
                    label="Especialidades"
                    value={
                      provider.specialties.length
                        ? provider.specialties.map(naturalLabel).join(", ")
                        : "Serviços automotivos homologados"
                    }
                  />
                  <Info
                    label="Avaliação"
                    value={
                      provider.rating === null
                        ? "Ainda sem avaliação"
                        : `${provider.rating.toFixed(1)} de 5`
                    }
                  />
                  <Info
                    label="Status"
                    value={
                      provider.status === "active"
                        ? "Disponível na rede VERAH"
                        : "Indisponível"
                    }
                  />
                </CardContent>
              </Card>
            )}
            {quote && quote.status !== "draft" && (
              <CustomerQuote quote={quote} requestId={id} />
            )}
            {request.serviceStage === "concluido" && (
              <Card className="border-teal-200">
                <CardContent className="space-y-4 p-6">
                  <h2 className="text-xl font-semibold">
                    Atendimento concluído
                  </h2>
                  <p>A VERAH acompanhou seu atendimento do início ao fim.</p>
                  <p className="rounded-lg bg-teal-50 p-3 text-sm font-semibold text-teal-900">
                    Serviço realizado por Prestador homologado VERAH.
                  </p>
                  {request.completionNotes && (
                    <Info
                      label="Observações finais"
                      value={request.completionNotes}
                    />
                  )}
                  <Info
                    label="Data de conclusão"
                    value={
                      request.completedAt
                        ? new Intl.DateTimeFormat("pt-BR", {
                            timeZone: "America/Sao_Paulo",
                            dateStyle: "short",
                            timeStyle: "short",
                          }).format(new Date(request.completedAt))
                        : "—"
                    }
                  />
                  {request.customerRating ? (
                    <div className="rounded bg-emerald-50 p-3">
                      <p className="font-semibold">
                        Sua nota: {request.customerRating}/5
                      </p>
                      <p>Obrigada por avaliar sua experiência.</p>
                    </div>
                  ) : (
                    <form action={submitRating} className="space-y-3">
                      <input
                        type="hidden"
                        name="requestId"
                        value={request.id}
                      />
                      <label className="block text-sm font-semibold">
                        Nota
                        <select
                          name="rating"
                          className="ml-3 rounded border px-3 py-2"
                          required
                        >
                          <option value="5">5 — Excelente</option>
                          <option value="4">4 — Muito bom</option>
                          <option value="3">3 — Bom</option>
                          <option value="2">2 — Regular</option>
                          <option value="1">1 — Ruim</option>
                        </select>
                      </label>
                      <textarea
                        name="feedback"
                        className="w-full rounded border p-2"
                        placeholder="Comentário opcional"
                      />
                      <button className="rounded bg-teal-700 px-4 py-2 text-white">
                        Enviar avaliação
                      </button>
                    </form>
                  )}
                </CardContent>
              </Card>
            )}
            <p className="rounded-xl bg-rose-50 p-5 text-sm leading-6 text-rose-900">
              Nenhuma execução começa sem sua aprovação.
            </p>
          </div>
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold">Acompanhamento</h2>
              <ol className="mt-6 space-y-0">
                {customerJourneyStages.map((stage, index) => (
                  <li key={stage} className="relative flex gap-3 pb-7 last:pb-0">
                    <span
                      className={`relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${index < currentStage || (request.serviceStage === "concluido" && index === currentStage) ? "border-teal-700 bg-teal-700 text-white" : index === currentStage ? "border-teal-700 bg-white text-teal-800 ring-4 ring-teal-100" : "border-slate-200 bg-white text-slate-400"}`}
                    >
                      {index < currentStage ||
                      (request.serviceStage === "concluido" &&
                        index === currentStage)
                        ? "✓"
                        : index + 1}
                    </span>
                    {index < customerJourneyStages.length - 1 && (
                      <span className="absolute left-[9px] top-5 h-full w-px bg-slate-200" />
                    )}
                    <div>
                      <p
                        className={
                          index <= currentStage
                            ? "font-semibold text-teal-900"
                            : "font-medium text-slate-500"
                        }
                      >
                        {customerStageLabels[stage]}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {stageDates[index]
                          ? date(stageDates[index]!)
                          : index === currentStage
                            ? "Etapa atual"
                            : "Próxima etapa"}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </section>
    </DemoShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap leading-6 text-slate-800">
        {value}
      </p>
    </div>
  );
}

function naturalLabel(value: string) {
  const label = value.replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function insuranceLabel(value: "yes" | "no" | "unknown") {
  return value === "yes" ? "Sim" : value === "no" ? "Não" : "Não sei";
}

const date = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
function UrgencyBadge({ urgency }: { urgency: ServiceUrgency }) {
  const styles = {
    baixa: "border-emerald-200 bg-emerald-50 text-emerald-800",
    media: "border-amber-200 bg-amber-50 text-amber-900",
    alta: "border-orange-200 bg-orange-50 text-orange-900",
    critica: "border-red-200 bg-red-50 text-red-900",
  };
  const icons = { baixa: "✓", media: "!", alta: "▲", critica: "⚠" };
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Urgência
      </p>
      <p
        className={`mt-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${styles[urgency]}`}
      >
        <span aria-hidden="true">{icons[urgency]}</span>
        {urgency === "media"
          ? "Média"
          : urgency.charAt(0).toUpperCase() + urgency.slice(1)}
      </p>
    </div>
  );
}
function CustomerQuote({
  quote,
  requestId,
}: {
  quote: NonNullable<Awaited<ReturnType<typeof getQuoteForRequest>>>;
  requestId: string;
}) {
  const money = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <h2 className="text-xl font-semibold">Proposta da rede VERAH</h2>
        <p className="text-sm text-slate-600">
          Preparada por um prestador homologado da nossa rede.
        </p>
        <p>
          {quote.customerSummary ??
            "Serviços recomendados conforme avaliação técnica."}
        </p>
        <div className="space-y-3">
          {quote.items.map((i) => {
            const unit = i.itemType === "labor" ? "hora" : "unidade";
            return (
              <div key={i.id} className="rounded-lg border p-3 text-sm">
                <p className="font-semibold">{i.description}</p>
                <p className="text-slate-500">
                  {i.isOptional ? "Opcional" : "Obrigatório"}
                </p>
                <p>
                  {i.quantity.toLocaleString("pt-BR")} {unit}
                  {i.quantity === 1 ? "" : "s"} × {money(i.unitPrice)}
                </p>
                <p className="font-medium">Total: {money(i.totalPrice)}</p>
              </div>
            );
          })}
        </div>
        <div className="border-t pt-3 text-sm">
          <p>Mão de obra: {money(quote.laborTotal)}</p>
          <p>Peças: {money(quote.partsTotal)}</p>
          <p>Serviços e adicionais: {money(quote.additionalTotal)}</p>
          <p className="mt-2 text-lg font-semibold">
            Total geral: {money(quote.totalAmount)}
          </p>
        </div>
        <Info
          label="Prazo estimado"
          value={quote.estimatedDuration ?? "Não informado"}
        />
        <Info label="Garantia" value={quote.warrantyText ?? "Não informada"} />
        <Info label="Validade" value={quote.validUntil ?? "Não informada"} />
        {quote.technicalNotes && (
          <Info label="Observações" value={quote.technicalNotes} />
        )}{" "}
        {quote.status === "submitted" && (
          <>
            <p className="rounded-lg bg-amber-50 p-3 text-sm">
              Você está aprovando o valor total de {money(quote.totalAmount)}. A
              execução será iniciada somente após esta confirmação.
            </p>
            <form action={decideQuote} className="space-y-3">
              <input type="hidden" name="quoteId" value={quote.id} />
              <input type="hidden" name="requestId" value={requestId} />
              <textarea
                name="note"
                className="w-full rounded border p-2"
                placeholder="Nota opcional ou pedido de esclarecimento"
              />
              <div className="flex gap-3">
                <button
                  name="intent"
                  value="approve"
                  className="rounded bg-teal-700 px-4 py-2 text-white"
                >
                  Aprovar orçamento
                </button>
                <button
                  name="intent"
                  value="clarification"
                  className="rounded border px-4 py-2"
                >
                  Solicitar esclarecimento
                </button>
              </div>
            </form>
          </>
        )}
        {quote.status !== "submitted" && (
          <p className="rounded bg-slate-100 p-3 text-sm">
            Status: {quote.status.replaceAll("_", " ")}
            {quote.customerDecisionNote
              ? ` — ${quote.customerDecisionNote}`
              : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
