import { calculateCommercialQuote, COMMERCIAL_TEST_SCENARIOS, type CommercialInput } from "@/lib/commercial-engine";
import { requireRole } from "@/services/auth/profile";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function numeric(value: string | undefined, fallback: number) {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function preset(name?: string): CommercialInput {
  if (name === "small") return COMMERCIAL_TEST_SCENARIOS.small;
  if (name === "high") return COMMERCIAL_TEST_SCENARIOS.highTicket;
  return COMMERCIAL_TEST_SCENARIOS.mediumWithLogistics;
}

export default async function CommercialSimulatorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireRole(["admin"]);
  const query = await searchParams;
  const base = preset(query.preset);
  const baseLogistics = base.logistics;

  const hasLogistics = query.logistics === undefined ? Boolean(baseLogistics) : query.logistics === "1";
  const input: CommercialInput = {
    providerCost: numeric(query.providerCost, base.providerCost),
    serviceRule: {
      percent: numeric(query.percent, base.serviceRule.percent * 100) / 100,
      minimumMargin: numeric(query.minimumMargin, base.serviceRule.minimumMargin),
      maximumMargin: query.maximumMargin
        ? numeric(query.maximumMargin, base.serviceRule.maximumMargin ?? 0)
        : base.serviceRule.maximumMargin,
    },
    paymentFee: numeric(query.paymentFee, 0),
    otherVariableCosts: numeric(query.otherCosts, 0),
    ...(hasLogistics
      ? {
          logistics: {
            operationalKm: numeric(query.km, baseLogistics?.operationalKm ?? 18),
            estimatedMinutes: numeric(query.minutes, baseLogistics?.estimatedMinutes ?? 55),
            additionalCosts: numeric(query.additionalCosts, baseLogistics?.additionalCosts ?? 0),
            customerRule: {
              base: numeric(query.logisticsBase, baseLogistics?.customerRule.base ?? 10),
              kmRate: numeric(query.customerKmRate, baseLogistics?.customerRule.kmRate ?? 1),
              minuteRate: numeric(query.customerMinuteRate, baseLogistics?.customerRule.minuteRate ?? 0.2),
              minimumPrice: numeric(query.minimumLogistics, baseLogistics?.customerRule.minimumPrice ?? 79),
              margin: numeric(query.logisticsMargin, baseLogistics?.customerRule.margin ?? 20),
            },
            payoutRule: {
              base: numeric(query.payoutBase, baseLogistics?.payoutRule.base ?? 10),
              kmRate: numeric(query.payoutKmRate, baseLogistics?.payoutRule.kmRate ?? 1),
              minuteRate: numeric(query.payoutMinuteRate, baseLogistics?.payoutRule.minuteRate ?? 0.4),
              bonus: numeric(query.payoutBonus, baseLogistics?.payoutRule.bonus ?? 5),
            },
          },
        }
      : {}),
  };

  const result = calculateCommercialQuote(input);
  const contributionRate = result.customerTotal > 0 ? (result.verahGrossContribution / result.customerTotal) * 100 : 0;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <section className="rounded-3xl border border-rose-100 bg-white p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">Admin · hipótese de teste</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">Motor Comercial VERAH</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Simulador interno para validar preço final, repasses e margem antes de escolher o gateway definitivo. Nenhum valor desta tela é política comercial oficial.
        </p>
        <div className="mt-5 flex flex-wrap gap-2 text-sm">
          <a className="rounded-full border px-3 py-2 font-semibold text-slate-700" href="?preset=small&logistics=0">Serviço pequeno</a>
          <a className="rounded-full border px-3 py-2 font-semibold text-slate-700" href="?preset=medium&logistics=1">Médio + Leva & Traz</a>
          <a className="rounded-full border px-3 py-2 font-semibold text-slate-700" href="?preset=high&logistics=0">Alto ticket</a>
        </div>
      </section>

      <form className="grid gap-4 rounded-3xl border border-rose-100 bg-white p-6 shadow-sm lg:grid-cols-3">
        <Field name="providerCost" label="Custo/repasse prestador (R$)" value={input.providerCost} />
        <Field name="percent" label="Margem serviço (%)" value={input.serviceRule.percent * 100} />
        <Field name="minimumMargin" label="Margem mínima serviço (R$)" value={input.serviceRule.minimumMargin} />
        <Field name="maximumMargin" label="Teto de margem serviço (R$)" value={input.serviceRule.maximumMargin ?? ""} />
        <Field name="paymentFee" label="Taxa pagamento estimada (R$)" value={input.paymentFee ?? 0} />
        <Field name="otherCosts" label="Outros custos variáveis (R$)" value={input.otherVariableCosts ?? 0} />

        <label className="flex items-center gap-3 rounded-2xl border p-4 text-sm font-semibold text-slate-700 lg:col-span-3">
          <input type="checkbox" name="logistics" value="1" defaultChecked={hasLogistics} />
          Incluir Leva & Traz VERAH
        </label>

        {hasLogistics && input.logistics ? (
          <>
            <Field name="km" label="Km operacionais totais" value={input.logistics.operationalKm} />
            <Field name="minutes" label="Tempo estimado (min)" value={input.logistics.estimatedMinutes} />
            <Field name="additionalCosts" label="Custos adicionais (R$)" value={input.logistics.additionalCosts ?? 0} />
            <Field name="logisticsBase" label="Base logística cliente (R$)" value={input.logistics.customerRule.base} />
            <Field name="customerKmRate" label="Preço cliente por km (R$)" value={input.logistics.customerRule.kmRate} />
            <Field name="customerMinuteRate" label="Preço cliente por min (R$)" value={input.logistics.customerRule.minuteRate} />
            <Field name="minimumLogistics" label="Preço mínimo logística (R$)" value={input.logistics.customerRule.minimumPrice} />
            <Field name="logisticsMargin" label="Margem logística (R$)" value={input.logistics.customerRule.margin} />
            <Field name="payoutBase" label="Repasse base operador (R$)" value={input.logistics.payoutRule.base} />
            <Field name="payoutKmRate" label="Repasse operador por km (R$)" value={input.logistics.payoutRule.kmRate} />
            <Field name="payoutMinuteRate" label="Repasse operador por min (R$)" value={input.logistics.payoutRule.minuteRate} />
            <Field name="payoutBonus" label="Bônus operador (R$)" value={input.logistics.payoutRule.bonus ?? 0} />
          </>
        ) : null}

        <div className="lg:col-span-3">
          <button className="min-h-11 rounded-xl bg-teal-700 px-5 font-semibold text-white hover:bg-teal-800" type="submit">Recalcular teste</button>
        </div>
      </form>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Cliente paga" value={money.format(result.customerTotal)} strong />
        <Metric label="Prestador recebe" value={money.format(result.providerAmount)} />
        <Metric label="Operador recebe" value={money.format(result.operatorPayout)} />
        <Metric label="Contribuição VERAH" value={money.format(result.verahGrossContribution)} strong />
        <Metric label="Preço serviço" value={money.format(result.serviceCustomerPrice)} />
        <Metric label="Margem serviço" value={money.format(result.serviceMargin)} />
        <Metric label="Preço Leva & Traz" value={money.format(result.logisticsCustomerPrice)} />
        <Metric label="Contribuição / total" value={`${contributionRate.toFixed(1)}%`} />
      </section>

      <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
        <strong>Regra de teste:</strong> a cliente vê apenas o preço final VERAH. Prestador e operador veem somente seus próprios valores. Concierge não altera preço. Antes de dinheiro real, gateway, split, tributação e responsabilidade fiscal continuam sujeitos à validação específica.
      </section>
    </main>
  );
}

function Field({ name, label, value }: { name: string; label: string; value: string | number }) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <input
        className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-normal text-slate-950 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
        type="number"
        min="0"
        step="0.01"
        name={name}
        defaultValue={value}
      />
    </label>
  );
}

function Metric({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <article className={`rounded-3xl border p-5 ${strong ? "border-teal-200 bg-teal-50" : "border-slate-100 bg-white"}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${strong ? "text-teal-900" : "text-slate-950"}`}>{value}</p>
    </article>
  );
}
