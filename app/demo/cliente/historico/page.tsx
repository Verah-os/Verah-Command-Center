import Link from "next/link";
import { ArrowRight, FileClock } from "lucide-react";
import { CustomerShell } from "@/components/customer/customer-shell";
import { Card, CardContent } from "@/components/ui/card";
import { customerStageLabels } from "@/lib/customer-service-stage";
import { requireRole } from "@/services/auth/profile";
import { listCustomerVehicles } from "@/services/customer-vehicles";
import { listCustomerServiceRequests } from "@/services/service-requests";
import { listCustomerQuoteSummaries } from "@/services/service-quotes";

const filters = [
  ["all", "Todos"],
  ["completed", "Concluídos"],
  ["cancelled", "Cancelados"],
  ["open", "Em andamento"],
] as const;
const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" });
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default async function CustomerHistoryPage({ searchParams }: { searchParams: Promise<{ status?: string; vehicle?: string }> }) {
  await requireRole(["customer"]);
  const [query, vehicles, requests] = await Promise.all([searchParams, listCustomerVehicles(), listCustomerServiceRequests()]);
  const quotes = await listCustomerQuoteSummaries(requests.map((request) => request.id));
  const status = filters.some(([value]) => value === query.status) ? query.status ?? "all" : "all";
  const filtered = requests.filter((request) => {
    const matchesStatus = status === "all" || (status === "completed" && request.serviceStage === "concluido") || (status === "cancelled" && request.serviceStage === "cancelado") || (status === "open" && !["concluido", "cancelado"].includes(request.serviceStage));
    return matchesStatus && (!query.vehicle || request.vehicleId === query.vehicle);
  });

  return (
    <CustomerShell>
      <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <div><p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal-700">Sua jornada</p><h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Histórico de cuidados</h1><p className="mt-3 text-slate-600">Atendimentos, valores aprovados, avaliações e garantias em um só lugar.</p></div>
        <div className="mt-7 rounded-2xl border border-rose-100 bg-white/80 p-4">
          <nav aria-label="Filtrar histórico" className="flex flex-wrap gap-2">{filters.map(([value, label]) => <Link key={value} href={`/demo/cliente/historico?status=${value}${query.vehicle ? `&vehicle=${query.vehicle}` : ""}`} className={`rounded-full border px-4 py-2 text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-teal-100 ${status === value ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-teal-300"}`}>{label}</Link>)}</nav>
          {vehicles.length > 0 && <form className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-end" action="/demo/cliente/historico"><input type="hidden" name="status" value={status} /><label className="flex-1 text-sm font-semibold text-slate-700">Veículo<select name="vehicle" defaultValue={query.vehicle ?? ""} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 outline-none focus-visible:ring-4 focus-visible:ring-teal-100"><option value="">Todos os veículos</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.nickname ? `${vehicle.nickname} · ` : ""}{vehicle.brand} {vehicle.model}</option>)}</select></label><button className="min-h-11 rounded-xl border border-teal-200 px-5 font-semibold text-teal-800 outline-none hover:bg-teal-50 focus-visible:ring-4 focus-visible:ring-teal-100">Aplicar</button></form>}
        </div>
        <div className="mt-6 space-y-4">
          {filtered.length ? filtered.map((request) => {
            const quote = quotes.get(request.id);
            return <Card key={request.id} className="border-rose-100 bg-white/90 shadow-sm"><CardContent className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_auto]"><div><div className="flex flex-wrap items-center gap-3"><p className="font-mono text-sm font-semibold text-teal-800">{request.referenceCode}</p><span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-900">{customerStageLabels[request.serviceStage]}</span></div><h2 className="mt-3 text-lg font-semibold">{request.vehicleBrand} {request.vehicleModel}{request.vehicleYear ? ` · ${request.vehicleYear}` : ""}</h2><p className="mt-2 text-sm text-slate-500">{request.probableCategory ? naturalLabel(request.probableCategory) : "Categoria não informada"} · {date.format(new Date(request.createdAt))}</p><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600"><span>Valor aprovado: {quote?.status === "approved" ? money.format(quote.totalAmount) : "Não informado"}</span><span>Avaliação: {request.customerRating ? `${request.customerRating}/5` : "Não informada"}</span><span>Garantia: {quote?.warrantyText?.trim() ? "Registrada" : "Não informada"}</span></div></div><Link href={`/demo/cliente/atendimento/${request.id}`} className="inline-flex min-h-11 items-center gap-2 self-center font-semibold text-teal-800 outline-none focus-visible:ring-4 focus-visible:ring-teal-100">Ver detalhes <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></CardContent></Card>;
          }) : <Card className="border-dashed border-rose-200 bg-white/80"><CardContent className="p-9 text-center"><FileClock className="mx-auto h-8 w-8 text-teal-700" aria-hidden="true" /><p className="mt-4 font-semibold">Nenhum atendimento neste filtro.</p><p className="mt-2 text-sm text-slate-500">Você pode escolher outra etapa ou outro veículo.</p></CardContent></Card>}
        </div>
      </section>
    </CustomerShell>
  );
}

function naturalLabel(value: string) { const label = value.replaceAll("_", " "); return label.charAt(0).toUpperCase() + label.slice(1); }
