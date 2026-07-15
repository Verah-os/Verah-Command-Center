import Link from "next/link";
import type { Route } from "next";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Clock3,
  FileText,
  Filter,
  Gauge,
  Wrench,
} from "lucide-react";
import { ProviderShell } from "@/components/provider/provider-shell";
import { Card, CardContent } from "@/components/ui/card";
import { listActiveProviders } from "@/services/service-providers";
import { listProviderServiceRequests } from "@/services/service-requests";
import { listQuoteTimingsForRequests } from "@/services/service-quotes/service-quotes-service";
import { requireRole } from "@/services/auth/profile";
import type { ServiceRequest } from "@/types/service-request";
import type { ServiceQuoteTiming } from "@/services/service-quotes/service-quotes-service";

type ProviderFilter =
  | "todos"
  | "novos"
  | "preparar_orcamento"
  | "aguardando_aprovacao"
  | "em_execucao"
  | "finalizados"
  | "concluidos"
  | "cancelados";

type SearchParams = {
  provider?: string;
  filter?: string;
  urgency?: string;
  category?: string;
  period?: string;
};

const filters: Array<[ProviderFilter, string]> = [
  ["todos", "Todos"],
  ["novos", "Novos"],
  ["preparar_orcamento", "Preparar orçamento"],
  ["aguardando_aprovacao", "Aguardando aprovação"],
  ["em_execucao", "Em execução"],
  ["finalizados", "Finalizados pelo prestador"],
  ["concluidos", "Concluídos"],
  ["cancelados", "Cancelados"],
];

const formatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

const dayFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  weekday: "long",
  day: "numeric",
  month: "long",
});

export default async function ProviderPortalPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const profile = await requireRole(["provider", "admin"]);
  const query = await searchParams;
  const providers = profile.role === "admin" ? await listActiveProviders() : [];
  const providerId = profile.role === "provider" ? profile.providerId : query.provider;
  const selected =
    profile.role === "admin"
      ? providers.find((item) => item.id === providerId)
      : providerId
        ? { id: providerId, name: profile.displayName }
        : null;
  const requests = selected ? await listProviderServiceRequests(selected.id) : [];
  const quoteTimings = await listQuoteTimingsForRequests(
    requests.map((request) => request.id),
  );
  const filter = validFilter(query.filter);
  const visible = filterRequests(requests, quoteTimings, filter, query);
  const categories = unique(
    requests.flatMap((request) =>
      request.probableCategory ? [request.probableCategory] : [],
    ),
  );
  const indicators = providerIndicators(requests, quoteTimings);
  const activeCount = requests.filter(
    (request) => !["concluido", "cancelado"].includes(request.serviceStage),
  ).length;

  return (
    <ProviderShell displayName={selected?.name ?? profile.displayName}>
      <div className="space-y-7">
        <header className="rounded-[1.5rem] border border-rose-100 bg-white/95 p-5 shadow-[0_18px_45px_rgba(64,83,80,0.06)] sm:p-7">
          <p className="flex items-center gap-2 text-sm font-semibold text-teal-800">
            <Gauge className="h-4 w-4" aria-hidden="true" />
            <span className="capitalize">{dayFormatter.format(new Date())}</span>
          </p>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                Olá, {selected?.name ?? profile.displayName}
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
                Você tem <strong>{activeCount}</strong> {activeCount === 1 ? "atendimento ativo" : "atendimentos ativos"} para acompanhar.
              </p>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-800">
              <Wrench className="h-4 w-4" aria-hidden="true" /> Operação do dia
            </span>
          </div>
        </header>

        {profile.role === "admin" && (
          <form method="get" className="flex flex-col gap-3 rounded-2xl border border-rose-100 bg-white p-4 sm:flex-row">
            <select name="provider" defaultValue={providerId ?? ""} className="h-12 flex-1 rounded-xl border border-rose-100 px-3 outline-none focus-visible:border-teal-500 focus-visible:ring-4 focus-visible:ring-teal-100" required>
              <option value="" disabled>Selecione um prestador</option>
              {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name} · {provider.city}</option>)}
            </select>
            <button className="min-h-12 rounded-xl bg-teal-700 px-5 font-semibold text-white outline-none hover:bg-teal-800 focus-visible:ring-4 focus-visible:ring-teal-100">Visualizar</button>
          </form>
        )}

        {selected && (
          <>
            <section aria-label="Resumo operacional" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {[
                ["Novos", indicators.novos, <CircleDot key="new" />],
                ["Aguardando orçamento", indicators.orcamento, <FileText key="quote" />],
                ["Aguardando aprovação", indicators.aprovacao, <Clock3 key="approval" />],
                ["Em execução", indicators.execucao, <Wrench key="run" />],
                ["Finalizados", indicators.finalizados, <CheckCircle2 key="done-provider" />],
                ["Concluídos", indicators.concluidos, <CheckCircle2 key="done" />],
              ].map(([label, value, icon]) => (
                <Card key={label as string} className="provider-card min-w-0">
                  <CardContent className="p-4">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-teal-800 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
                    <p className="mt-3 text-[11px] font-semibold leading-4 text-slate-500">{label}</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
                  </CardContent>
                </Card>
              ))}
            </section>

            <nav aria-label="Filtros dos atendimentos" className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
              <div className="flex min-w-max gap-2 sm:min-w-0 sm:flex-wrap">
                {filters.map(([value, label]) => (
                  <Link key={value} href={filterHref(query, value)} aria-current={filter === value ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-teal-100 ${filter === value ? "border-teal-700 bg-teal-700 text-white" : "border-rose-100 bg-white text-slate-600 hover:bg-teal-50"}`}>
                    {label}
                  </Link>
                ))}
              </div>
            </nav>

            <details className="rounded-2xl border border-rose-100 bg-white" open={Boolean(query.urgency || query.category || query.period)}>
              <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2 px-4 text-sm font-semibold text-slate-700 outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-teal-100">
                <Filter className="h-4 w-4 text-teal-700" aria-hidden="true" /> Filtros adicionais
              </summary>
              <form method="get" className="grid gap-4 border-t border-rose-100 p-4 sm:grid-cols-2 lg:grid-cols-4">
                {profile.role === "admin" && <input type="hidden" name="provider" value={providerId ?? ""} />}
                <input type="hidden" name="filter" value={filter} />
                <Select name="urgency" label="Urgência" value={query.urgency}><option value="">Todas</option><option value="critica">Crítica</option><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option></Select>
                <Select name="category" label="Categoria" value={query.category}><option value="">Todas</option>{categories.map((category) => <option key={category} value={category}>{naturalLabel(category)}</option>)}</Select>
                <Select name="period" label="Período" value={query.period}><option value="">Todos</option><option value="hoje">Hoje</option><option value="7_dias">Últimos 7 dias</option></Select>
                <div className="flex items-end gap-2"><button className="min-h-11 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white">Aplicar</button><Link href={clearFiltersHref(query, filter)} className="inline-flex min-h-11 items-center rounded-xl border border-rose-100 px-3 text-sm font-semibold text-slate-600">Limpar</Link></div>
              </form>
            </details>

            <p className="text-sm font-medium text-slate-500" aria-live="polite">{visible.length} {visible.length === 1 ? "atendimento" : "atendimentos"}</p>
            <div className="grid gap-4">
              {visible.length ? visible.map((request) => {
                const action = actionLabel(request);
                return (
                  <Link key={request.id} href={requestHref(request.id, profile.role, selected.id)} className="rounded-2xl outline-none focus-visible:ring-4 focus-visible:ring-teal-100">
                    <Card className={`provider-card overflow-hidden transition hover:-translate-y-0.5 hover:border-teal-200 ${request.serviceStage === "cancelado" ? "bg-slate-50/80 opacity-80" : request.serviceStage === "concluido" ? "bg-emerald-50/30" : ""}`}>
                      <CardContent className="grid gap-5 p-5 sm:p-6 md:grid-cols-[1fr_1fr_0.8fr] md:items-center">
                        <div><p className="font-mono text-xs font-bold tracking-wide text-teal-800">{request.referenceCode}</p><p className="mt-2 font-semibold text-slate-900">{request.vehicleBrand} {request.vehicleModel}{request.vehicleYear ? ` · ${request.vehicleYear}` : ""}</p><p className="mt-1 text-sm text-slate-500">{request.city} · {naturalLabel(request.probableCategory ?? "outro")}</p></div>
                        <div className="flex flex-wrap gap-2"><StatusBadge label={naturalLabel(request.perceivedUrgency)} kind={request.perceivedUrgency} /><StatusBadge label={naturalLabel(request.serviceStage)} kind={request.serviceStage === "cancelado" ? "neutral" : request.serviceStage === "concluido" ? "success" : "stage"} /></div>
                        <div className="md:text-right"><p className="text-xs text-slate-500">Indicado em {request.providerAssignedAt ? formatter.format(new Date(request.providerAssignedAt)) : "data não informada"}</p><p className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-teal-800 md:justify-end">{action} <ArrowRight className="h-4 w-4" aria-hidden="true" /></p></div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              }) : <EmptyState filtered={requests.length > 0} filter={filter} />}
            </div>
          </>
        )}

        {profile.role === "provider" && !profile.providerId && <OperationalMessage title="Perfil sem vínculo" message="Seu perfil não está vinculado a um prestador. Solicite ao administrador a correção do cadastro." />}
        {!selected && profile.role === "admin" && <OperationalMessage title="Selecione um prestador" message="Escolha um prestador acima para visualizar a operação." />}
      </div>
    </ProviderShell>
  );
}

function providerIndicators(requests: ServiceRequest[], quotes: Map<string, ServiceQuoteTiming>) {
  return {
    novos: requests.filter((r) => r.serviceStage === "prestador_indicado" && !quotes.has(r.id)).length,
    orcamento: requests.filter((r) => r.serviceStage === "prestador_indicado").length,
    aprovacao: requests.filter((r) => r.serviceStage === "aguardando_aprovacao").length,
    execucao: requests.filter((r) => r.serviceStage === "em_execucao" && !r.providerCompletedAt).length,
    finalizados: requests.filter((r) => r.serviceStage === "em_execucao" && r.providerCompletedAt).length,
    concluidos: requests.filter((r) => r.serviceStage === "concluido").length,
  };
}

function filterRequests(requests: ServiceRequest[], quotes: Map<string, ServiceQuoteTiming>, filter: ProviderFilter, query: SearchParams) {
  const now = Date.now();
  const cutoff = query.period === "7_dias" ? now - 7 * 86_400_000 : query.period === "hoje" ? startOfSaoPauloDay() : null;
  const urgencyOrder = { critica: 0, alta: 1, media: 2, baixa: 3 };
  return requests
    .filter((request) => {
      const matchesFilter =
        filter === "todos" ||
        (filter === "novos" && request.serviceStage === "prestador_indicado" && !quotes.has(request.id)) ||
        (filter === "preparar_orcamento" && request.serviceStage === "prestador_indicado") ||
        (filter === "aguardando_aprovacao" && request.serviceStage === "aguardando_aprovacao") ||
        (filter === "em_execucao" && request.serviceStage === "em_execucao" && !request.providerCompletedAt) ||
        (filter === "finalizados" && request.serviceStage === "em_execucao" && Boolean(request.providerCompletedAt)) ||
        (filter === "concluidos" && request.serviceStage === "concluido") ||
        (filter === "cancelados" && request.serviceStage === "cancelado");
      const timestamp = Date.parse(request.providerAssignedAt ?? request.createdAt);
      return matchesFilter && (!query.urgency || request.perceivedUrgency === query.urgency) && (!query.category || request.probableCategory === query.category) && (cutoff === null || timestamp >= cutoff);
    })
    .sort((a, b) => {
      const aTerminal = ["concluido", "cancelado"].includes(a.serviceStage);
      const bTerminal = ["concluido", "cancelado"].includes(b.serviceStage);
      if (aTerminal !== bTerminal) return aTerminal ? 1 : -1;
      if (aTerminal && bTerminal) return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      return urgencyOrder[a.perceivedUrgency] - urgencyOrder[b.perceivedUrgency] || Date.parse(a.providerAssignedAt ?? a.createdAt) - Date.parse(b.providerAssignedAt ?? b.createdAt);
    });
}

function actionLabel(request: ServiceRequest) {
  if (request.serviceStage === "prestador_indicado") return "Preparar orçamento";
  if (request.serviceStage === "aguardando_aprovacao") return "Ver orçamento enviado";
  if (request.serviceStage === "em_execucao") return request.providerCompletedAt ? "Aguardando confirmação da VERAH" : "Finalizar serviço";
  if (request.serviceStage === "concluido") return "Ver resumo";
  if (request.serviceStage === "cancelado") return "Atendimento encerrado";
  return "Abrir atendimento";
}

type BadgeKind = "critica" | "alta" | "media" | "baixa" | "success" | "neutral" | "stage";
function StatusBadge({ label, kind }: { label: string; kind: BadgeKind }) {
  const styles: Record<BadgeKind, string> = { critica: "border-red-200 bg-red-50 text-red-800", alta: "border-orange-200 bg-orange-50 text-orange-800", media: "border-amber-200 bg-amber-50 text-amber-800", baixa: "border-emerald-200 bg-emerald-50 text-emerald-800", success: "border-emerald-200 bg-emerald-50 text-emerald-800", neutral: "border-slate-200 bg-slate-100 text-slate-600", stage: "border-teal-100 bg-teal-50 text-teal-800" };
  return <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${styles[kind]}`}>{kind === "critica" && <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}{label}</span>;
}

function Select({ name, label, value, children }: { name: string; label: string; value?: string; children: React.ReactNode }) {
  return <label className="text-xs font-semibold text-slate-600">{label}<select name={name} defaultValue={value ?? ""} className="mt-2 h-11 w-full rounded-xl border border-rose-100 bg-white px-3 text-sm font-normal outline-none focus-visible:border-teal-500 focus-visible:ring-4 focus-visible:ring-teal-100">{children}</select></label>;
}

function EmptyState({ filtered, filter }: { filtered: boolean; filter: ProviderFilter }) {
  return <Card className="provider-card"><CardContent className="p-10 text-center"><CircleDot className="mx-auto h-8 w-8 text-rose-300" aria-hidden="true" /><p className="mt-4 font-semibold text-slate-800">{filtered ? "Nenhum resultado para este filtro" : "Nenhum atendimento atribuído"}</p><p className="mt-2 text-sm text-slate-500">{filter === "em_execucao" ? "Nenhum serviço está em execução no momento." : filter === "concluidos" ? "Ainda não há atendimentos concluídos." : "Quando houver uma nova atribuição, ela aparecerá aqui."}</p></CardContent></Card>;
}

function OperationalMessage({ title, message }: { title: string; message: string }) {
  return <Card className="provider-card"><CardContent className="p-8 text-center"><h2 className="font-semibold text-slate-800">{title}</h2><p className="mt-2 text-sm text-slate-600">{message}</p></CardContent></Card>;
}

function validFilter(value?: string): ProviderFilter { return filters.some(([filter]) => filter === value) ? (value as ProviderFilter) : "todos"; }
function naturalLabel(value: string) { const label = value.replaceAll("_", " "); return label.charAt(0).toUpperCase() + label.slice(1); }
function unique(values: string[]) { return [...new Set(values)].sort((a, b) => a.localeCompare(b, "pt-BR")); }
function requestHref(id: string, role: string, providerId: string) { return `/demo/prestador/atendimento/${id}${role === "admin" ? `?provider=${providerId}` : ""}` as Route; }
function filterHref(query: SearchParams, filter: ProviderFilter) { const params = new URLSearchParams(); if (query.provider) params.set("provider", query.provider); params.set("filter", filter); for (const key of ["urgency", "category", "period"] as const) if (query[key]) params.set(key, query[key]!); return `/demo/prestador?${params}` as Route; }
function clearFiltersHref(query: SearchParams, filter: ProviderFilter) { const params = new URLSearchParams(); if (query.provider) params.set("provider", query.provider); params.set("filter", filter); return `/demo/prestador?${params}` as Route; }
function startOfSaoPauloDay() { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); return Date.parse(`${parts}T00:00:00-03:00`); }
