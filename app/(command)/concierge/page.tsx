import Link from "next/link";
import { redirect } from "next/navigation";
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
import { listActiveProviders } from "@/services/service-providers";
import { listConciergeServiceRequests } from "@/services/service-requests";
import { listQuoteTimingsForRequests } from "@/services/service-quotes/service-quotes-service";
import { createSupabaseServerClient } from "@/services/supabase/server";

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
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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
            <Link href={`/concierge?filter=${filter}` as Route} className="inline-flex min-h-11 items-center rounded-xl border border-rose-100 bg-white px-3 text-sm font-semibold text-slate-600 outline-none focus-visible:ring-4 focus-visible:ring-teal-100">Limpar</Link>
          </div>
        </form>
      </details>

      <p className="text-sm font-medium text-slate-500" aria-live="polite">
        {visible.length} {visible.length === 1 ? "atendimento" : "atendimentos"}
      </p>

      <div className="grid gap-3">
        {visible.length ? (
          visible.map((request) => {
            const pending = pendingQuestionCount(request);
            const sla = getSla(request, quoteTimings.get(request.id));
            const provider = providerName(request.providerId, providerMap);
            return (
              <Link
                key={request.id}
                href={`/concierge/${request.id}` as Route}
                className="rounded-2xl outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
              >
                <Card className={`concierge-card overflow-hidden transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-[0_20px_45px_rgba(45,94,88,0.1)] ${request.serviceStage === "cancelado" ? "bg-slate-50/80 opacity-80" : request.serviceStage === "concluido" ? "bg-emerald-50/30" : ""}`}>
                  <CardContent className="grid gap-5 p-5 md:grid-cols-[1fr_1.25fr_0.9fr_1fr] md:items-center sm:p-6">
                    <div>
                      <p className="font-mono text-xs font-bold tracking-wide text-teal-800">
                        {request.referenceCode}
                      </p>
                      <p className="mt-2 font-semibold text-slate-900">{request.customerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatter.format(new Date(request.createdAt))}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">
                        {request.vehicleBrand} {request.vehicleModel}
                        {request.vehicleYear ? ` · ${request.vehicleYear}` : ""}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {request.city} ·{" "}
                        {naturalLabel(request.probableCategory ?? "outro")}
                      </p>
                      {provider && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Prestador: {provider}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      {request.isPriority && (
                        <Badge value="Prioritário" kind="priority" />
                      )}
                      <Badge
                        value={naturalLabel(request.perceivedUrgency)}
                        kind={request.perceivedUrgency}
                      />
                      <p className="text-xs text-muted-foreground">
                        {request.requiresHumanReview
                          ? "Revisão humana"
                          : "Triagem revisada"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {pending
                          ? `${pending} ${pending === 1 ? "resposta pendente" : "respostas pendentes"}`
                          : "Sem respostas pendentes"}
                      </p>
                    </div>
                    <div className="space-y-2 md:text-right">
                      <Badge value={stageLabels[request.serviceStage]} kind={request.serviceStage === "cancelado" ? "neutral" : request.serviceStage === "concluido" ? "success" : "stage"} />
                      <p
                        className={`text-xs font-semibold ${sla.level === "atrasado" ? "text-red-700" : sla.level === "atencao" ? "text-amber-700" : "text-emerald-700"}`}
                      >
                        {sla.label} · {naturalLabel(sla.level)}
                      </p>
                      <p className="inline-flex items-center gap-1 text-xs font-semibold text-teal-800 md:justify-end">
                        Abrir detalhes <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })
        ) : (
          <Card className="concierge-card">
            <CardContent className="p-10 text-center">
              <CircleDot className="mx-auto h-8 w-8 text-rose-300" aria-hidden="true" />
              <p className="mt-4 font-semibold text-slate-800">Nenhum atendimento encontrado</p>
              <p className="mt-2 text-sm text-slate-500">Tente ajustar ou limpar os filtros selecionados.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Select({
  name,
  label,
  value,
  children,
}: {
  name: string;
  label: string;
  value?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="text-xs font-semibold text-muted-foreground">
      {label}
      <select
        name={name}
        defaultValue={value ?? ""}
        className="mt-2 h-11 w-full rounded-xl border border-rose-100 bg-white px-3 text-sm font-normal text-foreground outline-none focus-visible:border-teal-500 focus-visible:ring-4 focus-visible:ring-teal-100"
      >
        {children}
      </select>
    </label>
  );
}

type BadgeKind = "priority" | "critica" | "alta" | "media" | "baixa" | "success" | "neutral" | "stage";

function Badge({ value, kind = "stage" }: { value: string; kind?: BadgeKind }) {
  const styles: Record<BadgeKind, string> = {
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
    <span className={`mr-1 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${styles[kind]}`}>
      {kind === "priority" && <ShieldAlert className="h-3 w-3" aria-hidden="true" />}
      {kind === "critica" && <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
      {value}
    </span>
  );
}

function IndicatorIcon({ label }: { label: string }) {
  const className = "h-4 w-4";
  if (label === "Novos") return <CircleDot className={className} aria-hidden="true" />;
  if (label === "Aguardando cliente") return <MessageCircleQuestion className={className} aria-hidden="true" />;
  if (label === "Aguardando prestador") return <UserRoundCheck className={className} aria-hidden="true" />;
  if (label === "Em execução") return <Wrench className={className} aria-hidden="true" />;
  if (label === "Concluídos hoje") return <CheckCircle2 className={className} aria-hidden="true" />;
  return <Clock3 className={className} aria-hidden="true" />;
}

function hasSecondaryFilters(query: SearchParams) {
  return Boolean(query.city || query.category || query.urgency || query.provider || query.period);
}

function validFilter(value?: string): ConciergeFilter {
  return primaryFilters.some(([filter]) => filter === value)
    ? (value as ConciergeFilter)
    : "todos";
}

function validPeriod(value?: string): ConciergePeriod {
  return value === "hoje" || value === "7_dias" ? value : "todos";
}

function filterHref(query: SearchParams, filter: ConciergeFilter) {
  const params = new URLSearchParams();
  params.set("filter", filter);
  for (const key of ["city", "category", "urgency", "provider", "period"] as const) {
    if (query[key]) params.set(key, query[key]!);
  }
  return `/concierge?${params.toString()}` as Route;
}

function naturalLabel(value: string) {
  const label = value.replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function unique(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
