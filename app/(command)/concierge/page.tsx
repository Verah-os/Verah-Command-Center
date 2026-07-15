import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
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
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Operação do Concierge</p>
          <h1 className="text-2xl font-semibold">Atendimentos</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Priorize casos urgentes, acompanhe esperas e abra os detalhes para
            dar continuidade.
          </p>
        </div>
        <Link
          href={"/concierge/novo-atendimento" as Route}
          className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          Criar atendimento
        </Link>
      </header>

      {query.error && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {query.error}
        </p>
      )}

      <section aria-labelledby="indicators-title">
        <h2 id="indicators-title" className="sr-only">
          Indicadores operacionais
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          {indicatorCards.map(([label, value]) => (
            <Card key={label}>
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  {label}
                </p>
                <p className="mt-2 text-2xl font-semibold">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <nav aria-label="Filtros principais" className="flex flex-wrap gap-2">
        {primaryFilters.map(([value, label]) => (
          <Link
            key={value}
            href={filterHref(query, value)}
            aria-current={filter === value ? "page" : undefined}
            className={`rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${filter === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-white text-muted-foreground hover:bg-muted"}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      <form
        method="get"
        className="grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2 lg:grid-cols-6"
      >
        <input type="hidden" name="filter" value={filter} />
        <Select name="city" label="Cidade" value={query.city}>
          <option value="">Todas</option>
          {cities.map((city) => (
            <option key={city}>{city}</option>
          ))}
        </Select>
        <Select name="category" label="Categoria" value={query.category}>
          <option value="">Todas</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {naturalLabel(category)}
            </option>
          ))}
        </Select>
        <Select name="urgency" label="Urgência" value={query.urgency}>
          <option value="">Todas</option>
          <option value="critica">Crítica</option>
          <option value="alta">Alta</option>
          <option value="media">Média</option>
          <option value="baixa">Baixa</option>
        </Select>
        <Select name="provider" label="Prestador" value={query.provider}>
          <option value="">Todos</option>
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
            </option>
          ))}
        </Select>
        <Select name="period" label="Período" value={period}>
          <option value="hoje">Hoje</option>
          <option value="7_dias">Últimos 7 dias</option>
          <option value="todos">Todos</option>
        </Select>
        <div className="flex items-end gap-2">
          <button className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
            Aplicar
          </button>
          <Link
            href={`/concierge?filter=${filter}` as Route}
            className="inline-flex h-10 items-center rounded-md border bg-white px-3 text-sm"
          >
            Limpar
          </Link>
        </div>
      </form>

      <p className="text-sm text-muted-foreground" aria-live="polite">
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
                className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <Card className="transition hover:border-primary/40 hover:shadow-sm">
                  <CardContent className="grid gap-4 p-4 md:grid-cols-[1fr_1.2fr_0.9fr_1fr] md:items-center">
                    <div>
                      <p className="font-mono text-sm font-semibold text-primary">
                        {request.referenceCode}
                      </p>
                      <p className="mt-1 font-medium">{request.customerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatter.format(new Date(request.createdAt))}
                      </p>
                    </div>
                    <div>
                      <p className="font-medium">
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
                        <Badge value="Prioritário" priority />
                      )}
                      <Badge
                        value={naturalLabel(request.perceivedUrgency)}
                        urgent={["critica", "alta"].includes(
                          request.perceivedUrgency,
                        )}
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
                      <Badge
                        value={stageLabels[request.serviceStage]}
                      />
                      <p
                        className={`text-xs font-semibold ${sla.level === "atrasado" ? "text-red-700" : sla.level === "atencao" ? "text-amber-700" : "text-emerald-700"}`}
                      >
                        {sla.label} · {naturalLabel(sla.level)}
                      </p>
                      <p className="text-xs font-medium text-primary">
                        Abrir detalhes →
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })
        ) : (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Nenhum atendimento corresponde aos filtros selecionados.
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
        className="mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm font-normal text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {children}
      </select>
    </label>
  );
}

function Badge({
  value,
  urgent = false,
  priority = false,
}: {
  value: string;
  urgent?: boolean;
  priority?: boolean;
}) {
  return (
    <span
      className={`mr-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${priority ? "bg-amber-100 text-amber-900" : urgent ? "bg-red-100 text-red-800" : "bg-muted text-foreground"}`}
    >
      {value}
    </span>
  );
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
