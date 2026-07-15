import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { CustomerShell } from "@/components/customer/customer-shell";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/services/auth/profile";
import { listCustomerServiceRequests } from "@/services/service-requests";
import { listCustomerQuoteSummaries } from "@/services/service-quotes";

const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" });

export default async function CustomerGuaranteesPage() {
  await requireRole(["customer"]);
  const requests = await listCustomerServiceRequests();
  const completed = requests.filter((request) => request.serviceStage === "concluido");
  const quotes = await listCustomerQuoteSummaries(completed.map((request) => request.id));
  const guarantees = completed.flatMap((request) => {
    const quote = quotes.get(request.id);
    return quote?.status === "approved" && quote.warrantyText?.trim() ? [{ request, quote }] : [];
  });
  return (
    <CustomerShell>
      <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <div><p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal-700">Rede homologada VERAH</p><h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Suas garantias</h1><p className="mt-3 max-w-2xl leading-7 text-slate-600">Consulte as garantias registradas nos serviços concluídos, sem exposição da identidade comercial do prestador.</p></div>
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {guarantees.length ? guarantees.map(({ request, quote }) => <Card key={quote.id} className="border-teal-100 bg-white/90 shadow-sm"><CardContent className="p-6"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><ShieldCheck className="h-5 w-5" aria-hidden="true" /></span><p className="mt-5 text-xs font-semibold uppercase tracking-wide text-teal-700">Garantia da rede VERAH</p><h2 className="mt-2 text-lg font-semibold">{request.vehicleBrand} {request.vehicleModel}</h2><p className="mt-1 font-mono text-xs text-slate-500">{request.referenceCode}</p><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{quote.warrantyText}</p><dl className="mt-5 grid gap-3 border-t border-slate-100 pt-4 text-sm"><div><dt className="font-semibold text-slate-500">Conclusão</dt><dd className="mt-1">{request.completedAt ? date.format(new Date(request.completedAt)) : "Não informada"}</dd></div><div><dt className="font-semibold text-slate-500">Status</dt><dd className="mt-1">Validade não informada</dd></div></dl><Link href={`/demo/cliente/atendimento/${request.id}`} className="mt-5 inline-flex min-h-11 items-center gap-2 font-semibold text-teal-800 outline-none focus-visible:ring-4 focus-visible:ring-teal-100">Ver atendimento <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></CardContent></Card>) : <Card className="border-dashed border-rose-200 bg-white/80 sm:col-span-2"><CardContent className="p-10 text-center"><ShieldCheck className="mx-auto h-8 w-8 text-teal-700" aria-hidden="true" /><p className="mt-4 font-semibold">Nenhuma garantia registrada.</p><p className="mt-2 text-sm text-slate-500">Garantias informadas em propostas aprovadas aparecerão aqui após a conclusão do serviço.</p></CardContent></Card>}
        </div>
      </section>
    </CustomerShell>
  );
}
