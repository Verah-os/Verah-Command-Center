import Link from "next/link";
import { notFound } from "next/navigation";
import type { Route } from "next";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleDot,
  Clock3,
  FileText,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { ProviderShell } from "@/components/provider/provider-shell";
import { QuoteForm } from "@/components/demo/quote-form";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { requireRole } from "@/services/auth/profile";
import { providerComplete } from "@/services/service-completion";
import { getActiveProvider } from "@/services/service-providers";
import { getQuoteForRequest } from "@/services/service-quotes";
import { getProviderServiceRequest } from "@/services/service-requests";
import type { ServiceQuote } from "@/types/service-quote";
import type { ServiceRequest } from "@/types/service-request";

const formatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

export default async function ProviderRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    provider?: string;
    error?: string;
    completed?: string;
    saved?: string;
    submitted?: string;
  }>;
}) {
  const profile = await requireRole(["provider", "admin"]);
  const { id } = await params;
  const feedback = await searchParams;
  const providerId =
    profile.role === "provider" ? profile.providerId : feedback.provider;

  if (profile.role === "provider" && !providerId) {
    return (
      <OperationalError
        displayName={profile.displayName}
        message="Seu perfil não está vinculado a um prestador. Solicite ao administrador a correção do cadastro."
      />
    );
  }
  if (!providerId) notFound();
  const adminProvider =
    profile.role === "admin" ? await getActiveProvider(providerId) : null;
  if (profile.role === "admin" && !adminProvider) notFound();

  const request = await getProviderServiceRequest(id, providerId);
  if (!request) notFound();
  const quote = await getQuoteForRequest(id);
  const action = primaryAction(request);
  const checklist = providerChecklist(request, quote);
  const events = providerTimeline(request, quote);

  return (
    <ProviderShell displayName={adminProvider?.name ?? profile.displayName}>
      <div className="space-y-6">
        <header className="rounded-[1.5rem] border border-rose-100 bg-white/95 p-5 shadow-[0_18px_45px_rgba(64,83,80,0.06)] sm:p-7">
          <Link href={providerBackHref(profile.role, providerId)} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-teal-800 outline-none hover:underline focus-visible:ring-4 focus-visible:ring-teal-100">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar aos atendimentos
          </Link>
          <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="font-mono text-xs font-bold tracking-wide text-teal-800">{request.referenceCode}</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                {request.vehicleBrand} {request.vehicleModel}
              </h1>
              <p className="mt-3 text-sm text-slate-600">
                {request.city} · {naturalLabel(request.probableCategory ?? "outro")}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <StatusBadge label={naturalLabel(request.perceivedUrgency)} kind={request.perceivedUrgency} />
                <StatusBadge label={naturalLabel(request.serviceStage)} kind={request.serviceStage === "cancelado" ? "neutral" : request.serviceStage === "concluido" ? "success" : "stage"} />
              </div>
            </div>
            {action.href ? (
              <Link href={action.href as Route} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 text-sm font-semibold text-white outline-none hover:bg-teal-800 focus-visible:ring-4 focus-visible:ring-teal-100">
                {action.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            ) : (
              <span className="inline-flex min-h-12 items-center rounded-xl bg-slate-100 px-5 text-sm font-semibold text-slate-600">{action.label}</span>
            )}
          </div>
        </header>

        {feedback.error && <p role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{feedback.error}</p>}
        {(feedback.completed || feedback.saved || feedback.submitted) && <p role="status" className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{feedback.completed ? "Serviço finalizado. Aguardando confirmação da VERAH." : feedback.submitted ? "Orçamento enviado para aprovação." : "Rascunho salvo com sucesso."}</p>}

        {request.serviceStage === "cancelado" && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
            <p className="font-semibold">Atendimento encerrado</p>
            <p className="mt-2">Este atendimento foi cancelado pela operação VERAH. Nenhuma nova ação está disponível.</p>
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="space-y-6">
            <Card className="provider-card overflow-hidden">
              <CardHeader className="bg-teal-50/50">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">Resumo VERAH</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900">Informações para execução</h2>
              </CardHeader>
              <CardContent className="space-y-6 p-5 sm:p-6">
                <Info label="Resumo técnico" value={request.copilotSummary ?? "Resumo não informado"} />
                <Info label="Briefing do prestador" value={request.copilotProviderBrief ?? "Revisão técnica necessária"} />
                <InfoList label="Sinais de atenção" items={request.copilotRiskSignals} empty="Nenhum sinal específico foi registrado." />
                {Object.keys(request.copilotAnswers).length > 0 && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Informações complementares</p>
                    <dl className="mt-3 space-y-3">
                      {Object.entries(request.copilotAnswers).map(([question, answer]) => (
                        <div key={question} className="rounded-xl border border-rose-100 bg-slate-50/60 p-4"><dt className="text-sm font-semibold text-slate-800">{question}</dt><dd className="mt-2 text-sm leading-6 text-slate-600">{answer}</dd></div>
                      ))}
                    </dl>
                  </div>
                )}
              </CardContent>
            </Card>

            {request.serviceStage === "prestador_indicado" && (!quote || quote.status === "draft") ? (
              <Card id="quote" className="provider-card scroll-mt-24 overflow-hidden">
                <CardHeader className="bg-rose-50/50"><p className="text-xs font-bold uppercase tracking-[0.16em] text-rose-700">Proposta comercial</p><h2 className="mt-1 text-xl font-semibold">Preparar orçamento</h2><p className="mt-2 text-sm text-slate-600">Informe itens, prazo, garantia e o resumo que será apresentado à cliente.</p></CardHeader>
                <CardContent className="p-4 sm:p-6"><QuoteForm requestId={id} providerId={providerId} initial={quote} /></CardContent>
              </Card>
            ) : quote ? (
              <QuoteView quote={quote} />
            ) : (
              <UnavailableState message="Nenhum orçamento está disponível para este atendimento." />
            )}

            {request.serviceStage === "em_execucao" && (
              <Card id="execution" className="provider-card scroll-mt-24 overflow-hidden">
                <CardHeader className="bg-teal-50/50"><p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">Execução</p><h2 className="mt-1 text-xl font-semibold">Serviço em andamento</h2></CardHeader>
                <CardContent className="space-y-5 p-5 sm:p-6">
                  {request.providerCompletedAt ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><p className="font-semibold">Serviço finalizado. Aguardando confirmação da VERAH.</p><p className="mt-2">Finalizado em {formatter.format(new Date(request.providerCompletedAt))}.</p>{request.completionNotes && <p className="mt-2">Observações: {request.completionNotes}</p>}</div>
                  ) : (
                    <form action={providerComplete} className="space-y-5">
                      <input type="hidden" name="requestId" value={request.id} />
                      <input type="hidden" name="providerId" value={providerId} />
                      <ul className="grid gap-3 text-sm sm:grid-cols-3">
                        {["Serviço executado", "Veículo revisado", "VERAH informada"].map((item) => <li key={item} className="flex items-center gap-2 rounded-xl bg-teal-50 p-3 text-teal-900"><Check className="h-4 w-4" aria-hidden="true" />{item}</li>)}
                      </ul>
                      <label className="block text-sm font-semibold text-slate-700">Observações finais<textarea name="notes" className="mt-2 min-h-28 w-full rounded-xl border border-rose-100 p-3 font-normal outline-none focus-visible:border-teal-500 focus-visible:ring-4 focus-visible:ring-teal-100" placeholder="Registre informações úteis sobre a conclusão" /></label>
                      <button className="min-h-12 w-full rounded-xl bg-teal-700 px-5 font-semibold text-white outline-none hover:bg-teal-800 focus-visible:ring-4 focus-visible:ring-teal-100 sm:w-auto">Marcar serviço como finalizado</button>
                    </form>
                  )}
                </CardContent>
              </Card>
            )}
            <p className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />O orçamento deve ser aprovado antes do início da execução.</p>
          </div>

          <aside className="space-y-6">
            <ProviderChecklist items={checklist} />
            <ProviderTimeline events={events} />
          </aside>
        </div>
      </div>
    </ProviderShell>
  );
}

function QuoteView({ quote }: { quote: ServiceQuote }) {
  return (
    <Card id="quote-view" className="provider-card scroll-mt-24 overflow-hidden">
      <CardHeader className="bg-rose-50/50"><p className="text-xs font-bold uppercase tracking-[0.16em] text-rose-700">Orçamento persistido</p><h2 className="mt-1 text-xl font-semibold">Proposta · {naturalLabel(quote.status)}</h2></CardHeader>
      <CardContent className="space-y-6 p-5 sm:p-6">
        <div className="space-y-3">{quote.items.map((item) => <div key={item.id} className="grid gap-2 rounded-xl border border-rose-100 p-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="font-semibold text-slate-800">{item.description}</p><p className="mt-1 text-xs text-slate-500">{item.quantity.toLocaleString("pt-BR")} × {money(item.unitPrice)} · {itemTypeLabel(item.itemType)}{item.isOptional ? " · Opcional" : ""}</p></div><p className="font-semibold tabular-nums text-slate-900">{money(item.totalPrice)}</p></div>)}</div>
        <FinancialSummary quote={quote} />
        <div className="grid gap-4 sm:grid-cols-2"><Info label="Prazo" value={quote.estimatedDuration ?? "Não informado"} /><Info label="Validade" value={quote.validUntil ? new Intl.DateTimeFormat("pt-BR").format(new Date(`${quote.validUntil}T12:00:00`)) : "Não informada"} /><Info label="Garantia" value={quote.warrantyText ?? "Não informada"} /><Info label="Resumo para a cliente" value={quote.customerSummary ?? "Não informado"} /></div>
        {quote.submittedAt && <p className="flex items-center gap-2 rounded-xl bg-teal-50 p-3 text-sm text-teal-900"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Enviado para aprovação em {formatter.format(new Date(quote.submittedAt))}.</p>}
      </CardContent>
    </Card>
  );
}

function FinancialSummary({ quote }: { quote: ServiceQuote }) {
  return <section aria-label="Resumo financeiro" className="grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-3"><Money label="Mão de obra" value={quote.laborTotal} /><Money label="Peças" value={quote.partsTotal} /><Money label="Serviços e adicionais" value={quote.additionalTotal} /><div className="border-t border-slate-200 pt-4 sm:col-span-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Total geral</p><p className="mt-1 text-2xl font-semibold tabular-nums text-teal-800">{money(quote.totalAmount)}</p></div></section>;
}

function ProviderChecklist({ items }: { items: Array<{ label: string; complete: boolean; current?: boolean }> }) {
  return <Card className="provider-card overflow-hidden"><CardHeader className="bg-rose-50/50"><p className="text-xs font-bold uppercase tracking-[0.16em] text-rose-700">Acompanhamento</p><h2 className="mt-1 font-semibold">Checklist operacional</h2></CardHeader><CardContent className="p-4"><ul className="space-y-2">{items.map((item) => <li key={item.label} className={`flex items-center gap-3 rounded-xl border p-3 text-sm ${item.complete ? "border-emerald-100 bg-emerald-50" : item.current ? "border-amber-200 bg-amber-50" : "border-slate-100 bg-slate-50"}`}><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${item.complete ? "bg-emerald-700 text-white" : item.current ? "bg-amber-200 text-amber-900" : "bg-slate-200 text-slate-500"}`}>{item.complete ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : item.current ? <Clock3 className="h-3.5 w-3.5" aria-hidden="true" /> : <CircleDot className="h-3.5 w-3.5" aria-hidden="true" />}</span><span>{item.label}</span></li>)}</ul></CardContent></Card>;
}

type ProviderEvent = { timestamp: string; title: string; description: string };
function ProviderTimeline({ events }: { events: ProviderEvent[] }) {
  return <Card className="provider-card overflow-hidden"><CardHeader className="bg-teal-50/50"><p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">Histórico operacional</p><h2 className="mt-1 font-semibold">Timeline</h2></CardHeader><CardContent className="p-5"><ol>{events.map((event, index) => <li key={`${event.timestamp}-${event.title}`} className="relative flex gap-4 pb-7 last:pb-0"><span className="relative z-10 mt-1 h-5 w-5 shrink-0 rounded-full border-4 border-teal-100 bg-teal-700" aria-hidden="true" />{index < events.length - 1 && <span className="absolute left-[9px] top-5 h-full w-px bg-teal-100" aria-hidden="true" />}<div><p className="text-sm font-semibold text-slate-800">{event.title}</p><p className="mt-1 text-sm leading-6 text-slate-600">{event.description}</p><p className="mt-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 font-mono text-[11px] text-slate-600">{formatter.format(new Date(event.timestamp))}</p></div></li>)}</ol></CardContent></Card>;
}

function providerChecklist(request: ServiceRequest, quote: ServiceQuote | null) {
  return [
    { label: "Atendimento revisado", complete: Boolean(request.copilotProviderBrief || request.copilotSummary) },
    { label: "Informações recebidas", complete: Boolean(request.providerAssignedAt) },
    { label: "Orçamento preparado", complete: Boolean(quote) },
    { label: "Orçamento enviado", complete: Boolean(quote?.submittedAt) },
    { label: "Cliente aprovou", complete: Boolean(quote?.approvedAt) },
    { label: "Serviço em execução", complete: ["em_execucao", "concluido"].includes(request.serviceStage) },
    { label: "Serviço finalizado", complete: Boolean(request.providerCompletedAt) },
    { label: "Aguardando confirmação da VERAH", complete: Boolean(request.conciergeConfirmedAt), current: Boolean(request.providerCompletedAt && !request.conciergeConfirmedAt) },
  ];
}

function providerTimeline(request: ServiceRequest, quote: ServiceQuote | null): ProviderEvent[] {
  return [
    request.createdAt ? { timestamp: request.createdAt, title: "Atendimento recebido", description: "A solicitação entrou na jornada VERAH." } : null,
    request.providerAssignedAt ? { timestamp: request.providerAssignedAt, title: "Prestador indicado", description: "O atendimento foi atribuído ao seu portal." } : null,
    quote?.submittedAt ? { timestamp: quote.submittedAt, title: "Orçamento enviado", description: "A proposta foi enviada para aprovação da cliente." } : null,
    quote?.approvedAt ? { timestamp: quote.approvedAt, title: "Cliente aprovou", description: "O orçamento foi aprovado e o serviço pôde ser iniciado." } : null,
    quote?.approvedAt ? { timestamp: quote.approvedAt, title: "Serviço iniciado", description: "O atendimento entrou em execução." } : null,
    request.providerCompletedAt ? { timestamp: request.providerCompletedAt, title: "Serviço finalizado", description: "A finalização foi registrada pelo prestador." } : null,
    request.conciergeConfirmedAt ? { timestamp: request.conciergeConfirmedAt, title: "VERAH confirmou", description: "A conclusão foi confirmada pela operação." } : null,
    request.completedAt ? { timestamp: request.completedAt, title: "Atendimento concluído", description: "A jornada foi encerrada com sucesso." } : null,
  ].filter((event): event is ProviderEvent => event !== null).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

function primaryAction(request: ServiceRequest) {
  if (request.serviceStage === "prestador_indicado") return { label: "Preparar orçamento", href: "#quote" };
  if (request.serviceStage === "aguardando_aprovacao") return { label: "Ver orçamento enviado", href: "#quote-view" };
  if (request.serviceStage === "em_execucao" && !request.providerCompletedAt) return { label: "Finalizar serviço", href: "#execution" };
  if (request.serviceStage === "em_execucao") return { label: "Aguardando confirmação da VERAH", href: null };
  if (request.serviceStage === "concluido") return { label: "Atendimento concluído", href: null };
  if (request.serviceStage === "cancelado") return { label: "Atendimento encerrado", href: null };
  return { label: "Ação indisponível", href: null };
}

function OperationalError({ message, displayName }: { message: string; displayName: string }) { return <ProviderShell displayName={displayName}><Card className="provider-card mx-auto mt-10 max-w-3xl"><CardContent className="p-8"><h1 className="text-xl font-semibold">Não foi possível abrir o atendimento</h1><p className="mt-3 text-sm text-slate-600">{message}</p></CardContent></Card></ProviderShell>; }
function UnavailableState({ message }: { message: string }) { return <Card className="provider-card"><CardContent className="p-8 text-center"><FileText className="mx-auto h-8 w-8 text-rose-300" aria-hidden="true" /><p className="mt-4 text-sm text-slate-600">{message}</p></CardContent></Card>; }
function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{value}</p></div>; }
function InfoList({ label, items, empty }: { label: string; items: string[]; empty: string }) { return <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>{items.length ? <ul className="mt-3 space-y-2">{items.map((item) => <li key={item} className="flex gap-2 text-sm text-slate-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />{item}</li>)}</ul> : <p className="mt-2 text-sm text-slate-600">{empty}</p>}</div>; }
function Money({ label, value }: { label: string; value: number }) { return <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 font-semibold tabular-nums text-slate-800">{money(value)}</p></div>; }
type BadgeKind = "critica" | "alta" | "media" | "baixa" | "success" | "neutral" | "stage";
function StatusBadge({ label, kind }: { label: string; kind: BadgeKind }) { const styles: Record<BadgeKind, string> = { critica: "border-red-200 bg-red-50 text-red-800", alta: "border-orange-200 bg-orange-50 text-orange-800", media: "border-amber-200 bg-amber-50 text-amber-800", baixa: "border-emerald-200 bg-emerald-50 text-emerald-800", success: "border-emerald-200 bg-emerald-50 text-emerald-800", neutral: "border-slate-200 bg-slate-100 text-slate-600", stage: "border-teal-100 bg-teal-50 text-teal-800" }; return <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${styles[kind]}`}>{kind === "critica" && <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}{label}</span>; }
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
function naturalLabel(value: string) { const label = value.replaceAll("_", " "); return label.charAt(0).toUpperCase() + label.slice(1); }
function itemTypeLabel(type: string) { return type === "labor" ? "Mão de obra" : type === "part" ? "Peça" : type === "service" ? "Serviço" : "Adicional"; }
function providerBackHref(role: string, providerId: string) { return `/demo/prestador${role === "admin" ? `?provider=${providerId}` : ""}` as Route; }
