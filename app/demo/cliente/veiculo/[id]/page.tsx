import type { Route } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CarFront, ShieldCheck, Wrench } from "lucide-react";
import { CustomerShell } from "@/components/customer/customer-shell";
import { VehicleEditForm } from "@/components/customer/vehicle-edit-form";
import { VehicleLogNav } from "@/components/customer/vehicle-log-nav";
import { Card, CardContent } from "@/components/ui/card";
import { maskPlate, nextCareMessages, vehicleName } from "@/lib/customer-vehicle";
import { customerStageLabels } from "@/lib/customer-service-stage";
import { requireRole } from "@/services/auth/profile";
import { getCustomerVehicle } from "@/services/customer-vehicles";
import { listCustomerServiceRequests } from "@/services/service-requests";
import { listCustomerQuoteSummaries } from "@/services/service-quotes";
import { loadVehicleLogHome } from "@/services/customer-vehicle-log/read";
import { formatBrzlCents, formatEnergyQuantity } from "@/lib/customer-vehicle-log";

const date = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
});

export default async function CustomerVehiclePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireRole(["customer"]);
  const [{ id }, feedback] = await Promise.all([params, searchParams]);
  const [vehicle, allRequests] = await Promise.all([
    getCustomerVehicle(id),
    listCustomerServiceRequests(),
  ]);
  if (!vehicle) notFound();
  const requests = allRequests.filter((request) => request.vehicleId === vehicle.id);
  const quotes = await listCustomerQuoteSummaries(requests.map((request) => request.id));
  const completed = requests.filter((request) => request.serviceStage === "concluido");
  const guarantees = completed.filter((request) => quotes.get(request.id)?.warrantyText?.trim());
  const lastService = completed[0];
  const careMessages = nextCareMessages(vehicle);
  const logHome = await loadVehicleLogHome(id);
  const latestFuel = logHome.latestFuel ?? null;
  const latestCharging = logHome.latestCharging ?? null;

  return (
    <CustomerShell>
      <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="rounded-[2rem] border border-rose-100 bg-white/85 p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-accent"><CarFront className="h-6 w-6" aria-hidden="true" /></span><div><p className="text-sm font-semibold text-rose-700">{vehicle.nickname ?? "Meu veículo"}</p><h1 className="mt-1 text-3xl font-semibold">{vehicleName(vehicle)}</h1><p className="mt-2 text-sm text-slate-500">Placa {maskPlate(vehicle.plate)}</p></div></div>
            <Link href={`/demo/cliente/novo-atendimento?vehicle=${vehicle.id}`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-center font-semibold text-white outline-none hover:bg-accent/90 focus-visible:ring-4 focus-visible:ring-accent/30">Solicitar atendimento para este veículo <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" /></Link>
          </div>
          <dl className="mt-7 grid gap-5 border-t border-slate-100 pt-6 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Localização" value={vehicle.city ? `${vehicle.city}${vehicle.state ? `/${vehicle.state}` : ""}` : "Ainda não informado"} />
            <Fact label="Quilometragem" value={vehicle.currentMileage === null ? "Ainda não informado" : `${vehicle.currentMileage.toLocaleString("pt-BR")} km`} />
            <Fact label="Última manutenção" value={lastService?.completedAt ? date.format(new Date(lastService.completedAt)) : vehicle.lastServiceAt ? date.format(new Date(vehicle.lastServiceAt)) : "Ainda não informado"} />
            <Fact label="Próximo cuidado" value={careMessages[0] ?? "Ainda não informado"} />
          </dl>
        </div>

        {(feedback.saved || feedback.error) && <p role="status" className={`mt-5 rounded-xl border p-4 text-sm ${feedback.error ? "border-rose-200 bg-rose-50 text-rose-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>{feedback.error ?? feedback.saved}</p>}

        <VehicleLogNav vehicleId={vehicle.id} active="" />

        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <LogPanel title="Última quilometragem" href={`/demo/cliente/veiculo/${vehicle.id}/mileage`}>
            {logHome.latestMileage ? (
              <p className="text-2xl font-semibold">{logHome.latestMileage.mileage_value.toLocaleString("pt-BR")} km</p>
            ) : (
              <p className="text-sm text-slate-500">Ainda sem registros. Adicione a quilometragem para acompanhar o uso.</p>
            )}
          </LogPanel>
          {latestFuel || latestCharging ? (
            <LogPanel title={latestFuel ? "Último abastecimento" : "Última recarga"} href={`/demo/cliente/veiculo/${vehicle.id}/fuel`}>
              <p className="text-sm font-medium text-slate-800">
                {latestFuel ? `${formatEnergyQuantity(latestFuel.liters, "L")} · ${formatBrzlCents(latestFuel.total_amount)}` : `${latestCharging ? formatEnergyQuantity(latestCharging.kwh, "kWh") : ""} · ${latestCharging ? formatBrzlCents(latestCharging.total_amount) : ""}`}
              </p>
            </LogPanel>
          ) : (
            <LogPanel title="Combustível e energia" href={`/demo/cliente/veiculo/${vehicle.id}/fuel`}>
              <p className="text-sm text-slate-500">Registre abastecimentos e recargas para acompanhar consumo.</p>
            </LogPanel>
          )}
          <LogPanel title="Despesas" href={`/demo/cliente/veiculo/${vehicle.id}/expenses`}>
            {logHome.expenseSummary && logHome.expenseSummary.total_cents > 0 ? (
              <p className="text-sm font-medium text-slate-800">{formatBrzlCents(logHome.expenseSummary.total_cents)} em {logHome.expenseSummary.expense_count} lançamento{logHome.expenseSummary.expense_count === 1 ? "" : "s"}</p>
            ) : (
              <p className="text-sm text-slate-500">Ainda sem despesas registradas.</p>
            )}
          </LogPanel>
          <LogPanel title="Manutenções" href={`/demo/cliente/veiculo/${vehicle.id}/maintenance`}>
            {logHome.maintenanceRecords.length ? (
              <p className="text-sm font-medium text-slate-800">{logHome.maintenanceRecords.length} manutenção{logHome.maintenanceRecords.length === 1 ? "" : "ões"} registrada{logHome.maintenanceRecords.length === 1 ? "" : "s"}</p>
            ) : (
              <p className="text-sm text-slate-500">Ainda sem manutenções registradas.</p>
            )}
          </LogPanel>
          <LogPanel title="Documentos" href={`/demo/cliente/veiculo/${vehicle.id}/documents`}>
            {logHome.documentCount ? (
              <p className="text-sm font-medium text-slate-800">{logHome.documentCount} documento{logHome.documentCount === 1 ? "" : "s"} anexado{logHome.documentCount === 1 ? "" : "s"}</p>
            ) : (
              <p className="text-sm text-slate-500">Ainda sem documentos anexados.</p>
            )}
          </LogPanel>
        </div>

        <Card className="mt-6 border-rose-100 bg-white/90"><CardContent className="p-6 sm:p-7"><h2 className="text-xl font-semibold">Atualizar informações</h2><p className="mt-2 text-sm text-slate-500">Marca, modelo, ano e placa permanecem protegidos. Você pode manter os dados de uso atualizados.</p><VehicleEditForm vehicle={vehicle} /></CardContent></Card>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card className="border-rose-100 bg-white/90"><CardContent className="p-6"><Heading icon={Wrench} title="Histórico do veículo" /><div className="mt-5 space-y-3">{requests.length ? requests.map((request) => <Link key={request.id} href={`/demo/cliente/atendimento/${request.id}`} className="block rounded-xl border border-slate-100 p-4 outline-none hover:border-accent/30 focus-visible:ring-4 focus-visible:ring-accent/30"><p className="font-mono text-xs font-semibold text-accent">{request.referenceCode}</p><p className="mt-1 font-medium">{request.probableCategory ? naturalLabel(request.probableCategory) : "Atendimento VERAH"}</p><p className="mt-1 text-sm text-slate-500">{customerStageLabels[request.serviceStage]} · {date.format(new Date(request.createdAt))}</p></Link>) : <p className="text-sm text-slate-500">Nenhum atendimento vinculado a este veículo.</p>}</div></CardContent></Card>
          <Card className="border-rose-100 bg-rose-50/60"><CardContent className="p-6"><Heading icon={ShieldCheck} title="Garantias relacionadas" /><div className="mt-5 space-y-3">{guarantees.length ? guarantees.map((request) => <div key={request.id} className="rounded-xl bg-white p-4"><p className="font-semibold">Garantia da rede VERAH</p><p className="mt-2 text-sm leading-6 text-slate-600">{quotes.get(request.id)?.warrantyText}</p><p className="mt-2 text-xs font-medium text-slate-500">Validade não informada</p></div>) : <p className="text-sm text-slate-500">Nenhuma garantia registrada para este veículo.</p>}</div></CardContent></Card>
        </div>
      </section>
    </CustomerShell>
  );
}

function Fact({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 text-sm font-medium text-slate-800">{value}</dd></div>; }
function Heading({ icon: Icon, title }: { icon: typeof Wrench; title: string }) { return <div className="flex items-center gap-3"><Icon className="h-5 w-5 text-accent" aria-hidden="true" /><h2 className="text-lg font-semibold">{title}</h2></div>; }
function naturalLabel(value: string) { const label = value.replaceAll("_", " "); return label.charAt(0).toUpperCase() + label.slice(1); }
function LogPanel({ title, href, children }: { title: string; href: string; children: ReactNode }) {
  return (
    <Card className="border-rose-100 bg-white/90">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
          <Link href={href as Route} className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-accent outline-none focus-visible:ring-4 focus-visible:ring-rose-200" aria-label={`Ver ${title}`}>Ver <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
        </div>
        <div className="mt-3">{children}</div>
      </CardContent>
    </Card>
  );
}
