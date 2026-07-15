import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, CarFront, Clock3, ShieldCheck, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CustomerShell } from "@/components/customer/customer-shell";
import { nextCareMessages, vehicleName } from "@/lib/customer-vehicle";
import { customerStageLabels } from "@/lib/customer-service-stage";
import { requireRole } from "@/services/auth/profile";
import { listCustomerVehicles } from "@/services/customer-vehicles";
import { listCustomerServiceRequests } from "@/services/service-requests";
import { listCustomerQuoteSummaries } from "@/services/service-quotes";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
});
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export default async function CustomerPage() {
  const profile = await requireRole(["customer"]);
  const [vehicles, requests] = await Promise.all([
    listCustomerVehicles(),
    listCustomerServiceRequests(),
  ]);
  const quotes = await listCustomerQuoteSummaries(
    requests.map((request) => request.id),
  );
  const vehicle = vehicles[0] ?? null;
  const openRequest = requests.find(
    (request) => !["concluido", "cancelado"].includes(request.serviceStage),
  );
  const completed = requests.filter(
    (request) => request.serviceStage === "concluido",
  );
  const recentCompleted = completed.slice(0, 3);
  const lastVehicleService = vehicle
    ? completed.find((request) => request.vehicleId === vehicle.id)
    : null;
  const activeWarranties = completed.filter((request) => {
    const quote = quotes.get(request.id);
    return Boolean(quote?.warrantyText?.trim());
  });
  const firstName = profile.displayName.trim().split(/\s+/)[0] || "cliente";

  return (
    <CustomerShell>
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="rounded-[2rem] border border-rose-100 bg-white/80 p-6 shadow-[0_24px_70px_rgba(77,54,60,0.08)] sm:p-9">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal-700">
                Olá, {firstName}
              </p>
              <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
                Seu veículo, seus cuidados, tudo em um só lugar.
              </h1>
              <p className="mt-3 max-w-2xl leading-7 text-slate-600">
                Acompanhe seu veículo e conte com a VERAH quando precisar.
              </p>
            </div>
            <Link
              href="/demo/cliente/novo-atendimento"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 font-semibold text-white outline-none transition hover:bg-teal-800 focus-visible:ring-4 focus-visible:ring-teal-200"
            >
              Solicitar atendimento <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <Card className="overflow-hidden border-rose-100 bg-white/90 shadow-sm">
            <CardContent className="p-6 sm:p-7">
              <SectionHeading icon={CarFront} title="Meu veículo" />
              {vehicle ? (
                <div className="mt-5">
                  <p className="text-sm font-semibold text-rose-700">
                    {vehicle.nickname ?? "Veículo principal"}
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold">{vehicleName(vehicle)}</h2>
                  <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                    <Fact
                      label="Quilometragem atual"
                      value={
                        vehicle.currentMileage === null
                          ? "Ainda não informado"
                          : `${vehicle.currentMileage.toLocaleString("pt-BR")} km`
                      }
                    />
                    <Fact
                      label="Última manutenção"
                      value={
                        lastVehicleService?.completedAt
                          ? dateFormatter.format(new Date(lastVehicleService.completedAt))
                          : vehicle.lastServiceAt
                            ? dateFormatter.format(new Date(vehicle.lastServiceAt))
                            : "Ainda não informado"
                      }
                    />
                    <Fact
                      label="Próximo cuidado"
                      value={nextCareMessages(vehicle)[0] ?? "Ainda não informado"}
                    />
                    <Fact
                      label="Localização"
                      value={
                        vehicle.city
                          ? `${vehicle.city}${vehicle.state ? `/${vehicle.state}` : ""}`
                          : "Ainda não informado"
                      }
                    />
                  </dl>
                  <LinkButton href={`/demo/cliente/veiculo/${vehicle.id}` as Route} label="Ver veículo" />
                  {vehicles.length > 1 && (
                    <div className="mt-4 border-t border-slate-100 pt-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Outros veículos
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {vehicles.slice(1).map((otherVehicle) => (
                          <Link
                            key={otherVehicle.id}
                            href={`/demo/cliente/veiculo/${otherVehicle.id}`}
                            className="rounded-full border border-teal-100 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
                          >
                            {otherVehicle.nickname ?? `${otherVehicle.brand} ${otherVehicle.model}`}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <EmptyCopy
                  title="Cadastre seu primeiro veículo"
                  text="Ele será salvo com segurança quando você abrir um novo atendimento."
                  href="/demo/cliente/novo-atendimento"
                  action="Adicionar veículo"
                />
              )}
            </CardContent>
          </Card>

          <Card className="border-teal-100 bg-teal-50/70 shadow-sm">
            <CardContent className="p-6 sm:p-7">
              <SectionHeading icon={Clock3} title="Atendimento atual" />
              {openRequest ? (
                <div className="mt-5">
                  <p className="font-mono text-sm font-semibold text-teal-800">
                    {openRequest.referenceCode}
                  </p>
                  <h2 className="mt-2 text-xl font-semibold">
                    {openRequest.vehicleBrand} {openRequest.vehicleModel}
                  </h2>
                  <span className="mt-4 inline-flex rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-teal-900">
                    {customerStageLabels[openRequest.serviceStage]}
                  </span>
                  <p className="mt-4 text-sm leading-6 text-slate-600">
                    {openRequest.copilotCustomerMessage ?? nextStep(openRequest.serviceStage)}
                  </p>
                  <LinkButton
                    href={`/demo/cliente/atendimento/${openRequest.id}` as Route}
                    label="Acompanhar"
                  />
                </div>
              ) : (
                <EmptyCopy
                  title="Nenhum atendimento em aberto"
                  text="Quando precisar, a VERAH organiza o próximo passo com você."
                  href="/demo/cliente/novo-atendimento"
                  action="Solicitar atendimento"
                />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <Card className="border-rose-100 bg-white/90 lg:col-span-1">
            <CardContent className="p-6">
              <SectionHeading icon={Sparkles} title="Próximos cuidados" />
              <div className="mt-5 space-y-3">
                {vehicle && nextCareMessages(vehicle).length ? (
                  nextCareMessages(vehicle).map((message) => (
                    <p key={message} className="rounded-xl bg-rose-50 p-4 text-sm leading-6 text-slate-700">
                      {message}
                    </p>
                  ))
                ) : (
                  <p className="text-sm leading-6 text-slate-500">Ainda não informado.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-rose-100 bg-white/90 lg:col-span-2">
            <CardContent className="p-6">
              <SectionHeading icon={Clock3} title="Histórico recente" />
              <div className="mt-5 space-y-3">
                {recentCompleted.length ? recentCompleted.map((request) => (
                  <Link
                    key={request.id}
                    href={`/demo/cliente/atendimento/${request.id}`}
                    className="grid gap-2 rounded-xl border border-slate-100 p-4 outline-none hover:border-teal-200 focus-visible:ring-4 focus-visible:ring-teal-100 sm:grid-cols-[1fr_auto]"
                  >
                    <div>
                      <p className="font-medium">{request.probableCategory ? naturalLabel(request.probableCategory) : "Atendimento VERAH"}</p>
                      <p className="mt-1 text-sm text-slate-500">{request.completedAt ? dateFormatter.format(new Date(request.completedAt)) : "Data não informada"} · {request.customerRating ? `Avaliação ${request.customerRating}/5` : "Sem avaliação"}</p>
                    </div>
                    <p className="font-semibold text-teal-800">{quotes.get(request.id)?.status === "approved" ? money.format(quotes.get(request.id)?.totalAmount ?? 0) : "Valor não informado"}</p>
                  </Link>
                )) : <p className="text-sm text-slate-500">Seu histórico aparecerá aqui após a conclusão de um atendimento.</p>}
              </div>
              <LinkButton href="/demo/cliente/historico" label="Ver histórico completo" />
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6 border-teal-100 bg-white/90">
          <CardContent className="p-6">
            <SectionHeading icon={ShieldCheck} title="Garantias da rede VERAH" />
            <p className="mt-4 text-sm leading-6 text-slate-600">
              {activeWarranties.length
                ? `${activeWarranties.length} garantia${activeWarranties.length === 1 ? "" : "s"} registrada${activeWarranties.length === 1 ? "" : "s"} no seu histórico.`
                : "Nenhuma garantia registrada até o momento."}
            </p>
            <LinkButton href="/demo/cliente/garantias" label="Ver garantias" />
          </CardContent>
        </Card>
      </section>
    </CustomerShell>
  );
}

function SectionHeading({ icon: Icon, title }: { icon: typeof CarFront; title: string }) {
  return <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><Icon className="h-5 w-5" aria-hidden="true" /></span><h2 className="text-lg font-semibold">{title}</h2></div>;
}
function Fact({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 text-sm font-medium text-slate-800">{value}</dd></div>;
}
function LinkButton({ href, label }: { href: Route; label: string }) {
  return <Link href={href} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg px-1 font-semibold text-teal-800 outline-none hover:text-teal-950 focus-visible:ring-4 focus-visible:ring-teal-100">{label}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>;
}
function EmptyCopy({ title, text, href, action }: { title: string; text: string; href: Route; action: string }) {
  return <div className="mt-5"><p className="font-semibold">{title}</p><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p><LinkButton href={href} label={action} /></div>;
}
function naturalLabel(value: string) {
  const label = value.replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}
function nextStep(stage: string) {
  const messages: Record<string, string> = {
    solicitado: "A VERAH recebeu seu relato e fará a triagem inicial.",
    concierge_aceitou: "Sua Concierge está revisando as informações.",
    prestador_indicado: "A rede VERAH está preparando uma proposta.",
    aguardando_aprovacao: "Revise a proposta antes de decidir.",
    em_execucao: "O serviço está em andamento com acompanhamento da VERAH.",
  };
  return messages[stage] ?? "Acompanhe os detalhes do atendimento.";
}
