import Link from "next/link";
import { ArrowRight, CarFront, Plus } from "lucide-react";
import { CustomerShell } from "@/components/customer/customer-shell";
import { Card, CardContent } from "@/components/ui/card";
import { nextCareMessages, vehicleName } from "@/lib/customer-vehicle";
import { requireRole } from "@/services/auth/profile";
import { listCustomerVehicles } from "@/services/customer-vehicles";

export default async function CustomerVehiclesPage() {
  await requireRole(["customer"]);
  const vehicles = await listCustomerVehicles();
  return (
    <CustomerShell>
      <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal-700">Sua garagem</p><h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Meus veículos</h1><p className="mt-3 text-slate-600">Informações organizadas para facilitar cada novo cuidado.</p></div>
          <Link href="/demo/cliente/novo-atendimento" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 font-semibold text-white outline-none hover:bg-teal-800 focus-visible:ring-4 focus-visible:ring-teal-200"><Plus className="h-4 w-4" aria-hidden="true" />Adicionar veículo</Link>
        </div>
        {vehicles.length ? (
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {vehicles.map((vehicle) => (
              <Card key={vehicle.id} className="border-rose-100 bg-white/90 shadow-sm">
                <CardContent className="p-6">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-teal-700"><CarFront className="h-5 w-5" aria-hidden="true" /></span>
                  <p className="mt-5 text-sm font-semibold text-rose-700">{vehicle.nickname ?? "Veículo"}</p>
                  <h2 className="mt-1 text-xl font-semibold">{vehicleName(vehicle)}</h2>
                  <p className="mt-3 text-sm text-slate-500">{vehicle.currentMileage === null ? "Quilometragem ainda não informada" : `${vehicle.currentMileage.toLocaleString("pt-BR")} km`}</p>
                  <p className="mt-2 text-sm text-slate-600">{nextCareMessages(vehicle)[0] ?? "Próximo cuidado ainda não informado"}</p>
                  <Link href={`/demo/cliente/veiculo/${vehicle.id}`} className="mt-5 inline-flex min-h-11 items-center gap-2 font-semibold text-teal-800 outline-none focus-visible:ring-4 focus-visible:ring-teal-100">Ver veículo <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="mt-8 border-dashed border-rose-200 bg-white/80"><CardContent className="p-8 text-center"><p className="font-semibold">Nenhum veículo cadastrado ainda.</p><p className="mt-2 text-sm text-slate-500">Ao solicitar um atendimento, você poderá adicionar seu primeiro veículo.</p></CardContent></Card>
        )}
      </section>
    </CustomerShell>
  );
}
