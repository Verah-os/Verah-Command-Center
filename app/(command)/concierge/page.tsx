import Link from "next/link";
import type { Route } from "next";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clock3,
  Filter,
  MessageCircleQuestion,
  Plus,
  ShieldAlert,
  UserRoundCheck,
  Wrench,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  filterAndSortRequests,
  getOperationalIndicators,
  getSla,
  pendingQuestionCount,
  providerName,
  type ConciergeFilter,
  type ConciergePeriod,
} from "@/lib/concierge-operations";
import { requireRole } from "@/services/auth/profile";
import { listActiveProviders } from "@/services/service-providers";
import { listConciergeServiceRequests } from "@/services/service-requests";
import { listQuoteTimingsForRequests } from "@/services/service-quotes/service-quotes-service";

const primaryFilters: Array<[ConciergeFilter, string]> = [
  ["todos", "Todos"],
  ["novos", "Novos"],
  ["em_analise", "Em análise"],
  ["aguardando_cliente", "Aguardando cliente"],
  ["aguardando_prestador", "Aguardando prestador"],
  ["aguardando_aprovacao", "Aguardando aprovação"],
  ["em_execucao", "Em execução"],
  ["concluidos", "Concluídos"],
  ["cancelados", "Cancelados"],
  ["urgentes", "Crítica/alta"],
  ["revisao", "Revisão humana"],
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

const stageLabels: Record<string, string> = {
  solicitado: "Solicitado",
  concierge_aceitou: "Concierge aceitou",
  prestador_indicado: "Prestador indicado",
  aguardando_aprovacao: "Aguardando aprovação",
  em_execucao: "Em execução",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

type SearchParams = {
  filter?: string;
  city?: string;
  category?: string;
  urgency?: string;
  provider?: string;
  period?: string;
  error?: string;
};

export default async function ConciergePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole(["concierge", "admin"]);

  const query = await searchParams;
  const filter = validFilter(query.filter);
  const period = validPeriod(query.period);
  const requests = await listConciergeServiceRequests();
  const [providers, quoteTimings] = await Promise.all([
    listActiveProviders(),
    listQuoteTimingsForRequests(requests.map((request) => request.id)),
  ]);
  const providerMap = new Map(providers.map((provider) => [provider.id, provider]));
  const visible = filterAndSortRequests(
    requests,
    {
      filter,
      city: query.city,
      category: query.category,
      urgency: query.urgency,
      provider: query.provider,
      period,
    },
    quoteTimings,
  );
  const indicators = getOperationalIndicators(requests);
  const cities = unique(requests.map((request) => request.city));
  const categories = unique(
    requests.flatMap((request) =>
      request.probableCategory ? [request.probableCategory] : [],
    ),
  );
  const indicatorCards = [
    ["Novos", indicators.novos],
    ["Em análise", indicators.emAnalise],
    ["Aguardando cliente", indicators.aguardandoCliente],
    ["Aguardando prestador", indicators.aguardandoPrestador],
    ["Aguardando aprovação", indicators.aguardandoAprovacao],
    ["Em execução", indicators.emExecucao],
    ["Concluídos hoje", indicators.concluidosHoje],
    ["Cancelados", indicators.cancelados],
  ] as const;

  return (
    <div className="space-y-7">
      <header className="flex flex-col gap-5 rounded-[1.5rem] border border-rose-100 bg-white/90 p-5 shadow-[0_18px_45px_rgba(64,83,80,0.06)] sm:p-7 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-teal-800">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            <span className="capitalize">{dayFormatter.format(new Date())}</span>
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Fila de atendimentos
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
            Acompanhe as esperas, acolha os casos urgentes e mantenha cada jornada em movimento.
          </p>
        </div>
        <Link
          href={"/concierge/novo-atendimento" as Route}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 text-sm font-semibold text-white shadow-sm outline-none transition hover:bg-teal-800 focus-visible:ring-4 focus-visible:ring-teal-100"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Criar atendimento
        </Link>
      </header>

      {query.error && (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {query.error}
        </p>
      )}

      <section aria-labelledby="indicators-title">
        <h2 id="indicators-title" className="sr-only">
          Indicadores operacionais
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          {indicatorCards.map(([label, value]) => (
            <Card key={label} className="concierge-card min-w-0 overflow-hidden border-rose-100/80">
              <CardContent className="p-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-teal-800">
                  <IndicatorIcon label={label} />
                </span>
                <p className="mt-3 text-[11px] font-semibold leading-4 text-slate-500">
                  {label}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <nav aria-label="Filtros principais" className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-2 sm:min-w-0 sm:flex-wrap">
          {primaryFilters.map(([value, label]) => (
            <Link
              key={value}
              href={filterHref(query, value)}
              aria-current={filter === value ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold outline-none transition focus-visible:ring-4 focus-visible:ring-teal-100 ${filter === value ? "border-teal-700 bg-teal-700 text-white shadow-sm" : "border-rose-100 bg-white text-slate-600 hover:border-teal-200 hover:bg-teal-50"}`}
            >
              {label}
            </Link>
          ))}
        </div>
      </nav>

      <details className="group rounded-2xl border border-rose-100 bg-white/90" open={hasSecondaryFilters(query)}>
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold text-slate-700 outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-teal-100 sm:px-5">
          <span className="flex items-center gap-2"><Filter className="h-4 w-4 text-teal-700" aria-hidden="true" /> Filtros avançados</span>
          <ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden="true" />
        </summary>
        <form method="get" className="grid gap-4 border-t border-rose-100 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-6">
          <input type="hidden" name="filter" value={filter} />
          <Select name="city" label="Cidade" value={query.city}>
            <option value="">Todas</option>{cities.map((city) => <option key={city}>{city}</option>)}
          </Select>
          <Select name="category" label="Categoria" value={query.category}>
            <option value="">Todas</option>{categories.map((category) => <option key={category} value={category}>{naturalLabel(category)}</option>)}
          </Select>
          <Select name="urgency" label="Urgência" value={query.urgency}>
            <option value="">Todas</option><option value="critica">Crítica</option><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option>
          </Select>
          <Select name="provider" label="Prestador" value={query.provider}>
            <option value="">Todos</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
          </Select>
          <Select name="period" label="Período" value={period}>
            <option value="hoje">Hoje</option><option value="7_dias">Últimos 7 dias</option><option value="todos">Todos</option>
          </Select>
          <div className="flex items-end gap-2">
            <button className="min-h-11 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white outline-none hover:bg-teal-800 focus-visible:ring-4 focus-visible:ring-teal-100">Aplicar</button>
            <Link href={"/concierge" as Route} className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-teal-800 hover:underline">Limpar</Link>
          </div>
        </form>
      </details>

      <section aria-labelledby="queue-title" className="rounded-[1.5rem] border border-rose-100 bg-white/95 p-4 shadow-[0_18px_45px_rgba(64,83,80,0.05)] sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">Fila real</p>
            <h2 id="queue-title" className="mt-1 text-xl font-semibold text-slate-950">Atendimentos autorizados</h2>
          </div>
          <p className="text-sm text-slate-500">{visible.length} {visible.length === 1 ? "atendimento" : "atendimentos"}</p>
        </div>

        {visible.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-rose-200 bg-rose-50/40 p-8 text-center">
            <CircleDot className="mx-auto h-9 w-9 text-rose-300" aria-hidden="true" />
            <p className="mt-4 font-semibold text-slate-900">Nenhum atendimento encontrado</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">A fila mostra somente chamados reais permitidos pelo seu perfil Concierge.</p>
          </div>
        ) : (
          <div className="mt-5 grid gap-3">
            {visible.map((request) => {
              const provider = providerName(request.providerId, providerMap);
              const sla = getSla(request);
              const questionCount = pendingQuestionCount(request);
              return (
                <Link
                  key={request.id}
                  href={`/concierge/${request.id}` as Route}
                  className="group rounded-2xl border border-slate-100 bg-slate-50/70 p-4 outline-none transition hover:border-teal-200 hover:bg-teal-50/60 focus-visible:ring-4 focus-visible:ring-teal-100 sm:p-5"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-teal-800">{request.referenceCode}</span>
                        <StatusPill stage={request.serviceStage} />
                        {request.requiresHumanReview && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800">Revisão humana</span>}
                      </div>
                      <h3 className="mt-3 truncate text-lg font-semibold text-slate-950">{request.customerName}</h3>
                      <p className="mt-1 text-sm text-slate-600">{request.vehicleBrand} {request.vehicleModel}{request.vehicleYear ? ` · ${request.vehicleYear}` : ""}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600 line-clamp-2">{request.customerReport}</p>
                    </div>
                    <div className="grid shrink-0 gap-2 text-xs text-slate-500 sm:min-w-48">
                      <span><strong className="text-slate-700">Urgência:</strong> {naturalLabel(request.perceivedUrgency)}</span>
                      <span><strong className="text-slate-700">Cidade:</strong> {request.city}</span>
                      <span><strong className="text-slate-700">Prestador:</strong> {provider ?? "Ainda não atribuído"}</span>
                      <span><strong className="text-slate-700">SLA:</strong> {sla.label}</span>
                      {questionCount > 0 && <span><strong className="text-slate-700">Pendências:</strong> {questionCount}</span>}
                      <span>{formatter.format(new Date(request.createdAt))}</span>
                    </div>
                  </div>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-teal-800">Abrir atendimento <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" /></span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function validFilter(value?: string): ConciergeFilter {
  return primaryFilters.some(([candidate]) => candidate === value) ? (value as ConciergeFilter) : "todos";
}

function validPeriod(value?: string): ConciergePeriod {
  return value === "hoje" || value === "7_dias" || value === "todos" ? value : "todos";
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function hasSecondaryFilters(query: SearchParams) {
  return Boolean(query.city || query.category || query.urgency || query.provider || query.period);
}

function filterHref(query: SearchParams, filter: ConciergeFilter) {
  const params = new URLSearchParams();
  params.set("filter", filter);
  if (query.city) params.set("city", query.city);
  if (query.category) params.set("category", query.category);
  if (query.urgency) params.set("urgency", query.urgency);
  if (query.provider) params.set("provider", query.provider);
  if (query.period) params.set("period", query.period);
  return `/concierge?${params.toString()}` as Route;
}

function naturalLabel(value: string) {
  const label = value.replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function Select({ name, label, value, children }: { name: string; label: string; value?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
      {label}
      <select name={name} defaultValue={value ?? ""} className="h-11 rounded-xl border border-rose-100 bg-white px-3 text-sm font-normal text-slate-700 outline-none focus-visible:border-teal-500 focus-visible:ring-4 focus-visible:ring-teal-100">
        {children}
      </select>
    </label>
  );
}

function StatusPill({ stage }: { stage: string }) {
  return <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-teal-800 ring-1 ring-inset ring-teal-100">{stageLabels[stage] ?? naturalLabel(stage)}</span>;
}

function IndicatorIcon({ label }: { label: string }) {
  if (label === "Novos") return <CircleDot className="h-4 w-4" aria-hidden="true" />;
  if (label === "Em análise") return <MessageCircleQuestion className="h-4 w-4" aria-hidden="true" />;
  if (label === "Aguardando cliente") return <UserRoundCheck className="h-4 w-4" aria-hidden="true" />;
  if (label === "Aguardando prestador") return <Wrench className="h-4 w-4" aria-hidden="true" />;
  if (label === "Aguardando aprovação") return <Clock3 className="h-4 w-4" aria-hidden="true" />;
  if (label === "Em execução") return <ShieldAlert className="h-4 w-4" aria-hidden="true" />;
  if (label === "Concluídos hoje") return <CheckCircle2 className="h-4 w-4" aria-hidden="true" />;
  if (label === "Cancelados") return <AlertTriangle className="h-4 w-4" aria-hidden="true" />;
  return <CircleDot className="h-4 w-4" aria-hidden="true" />;
}
