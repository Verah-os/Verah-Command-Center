import type { ReactNode } from "react";
import { Fuel, Zap } from "lucide-react";
import { RegisterVehicleChargingForm, RegisterVehicleFuelForm } from "@/components/customer/vehicle-log-forms";
import { VehicleLogPage } from "@/components/customer/vehicle-log-page";
import { VehicleLogEmpty } from "@/components/customer/vehicle-log-nav";
import { Card, CardContent } from "@/components/ui/card";
import { fuelTypeLabel, chargingTypeLabel, formatBrzlCents, formatEnergyQuantity } from "@/lib/customer-vehicle-log";
import { requireRole } from "@/services/auth/profile";
import { loadFuelChargingHome } from "@/services/customer-vehicle-log/read";

const date = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
});

export default async function FuelChargingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireRole(["customer"]);
  const [{ id }, feedback] = await Promise.all([params, searchParams]);
  const { vehicle, fuelLogs, chargingLogs } = await loadFuelChargingHome(id);

  return (
    <VehicleLogPage vehicle={vehicle} active="fuel" feedback={feedback}>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-rose-100 bg-white/90">
          <CardContent className="p-6 sm:p-7">
            <SectionHeading icon={Fuel} title="Abastecimento (combustível)" />
            <RegisterVehicleFuelForm vehicleId={vehicle.id} defaultOdometer={vehicle.currentMileage} />
          </CardContent>
        </Card>
        <Card className="border-rose-100 bg-white/90">
          <CardContent className="p-6 sm:p-7">
            <SectionHeading icon={Zap} title="Recarga (energia elétrica)" />
            <RegisterVehicleChargingForm vehicleId={vehicle.id} defaultOdometer={vehicle.currentMileage} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <HistoryCard title="Últimos abastecimentos" empty="Nenhum abastecimento registrado ainda." isEmpty={!fuelLogs.length}>
          {fuelLogs.slice(0, 8).map((log) => (
            <li key={log.id} className="flex flex-wrap items-center justify-between gap-2 py-4">
              <div>
                <p className="font-semibold">{fuelTypeLabel(log.fuel_type)} · {formatEnergyQuantity(log.liters, "L")}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {log.odometer_value.toLocaleString("pt-BR")} km
                  {log.consumption_kmpl !== null ? ` · ${log.consumption_kmpl.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km/L` : ""}
                  {log.note ? ` · ${log.note}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-slate-800">{formatBrzlCents(log.total_amount)}</p>
                <p className="mt-1 text-xs text-slate-500">{date.format(new Date(log.recorded_at))}</p>
              </div>
            </li>
          ))}
        </HistoryCard>
        <HistoryCard title="Últimas recargas" empty="Nenhuma recarga registrada ainda." isEmpty={!chargingLogs.length}>
          {chargingLogs.slice(0, 8).map((log) => (
            <li key={log.id} className="flex flex-wrap items-center justify-between gap-2 py-4">
              <div>
                <p className="font-semibold">{chargingTypeLabel(log.charging_type) ?? "Recarga"} · {formatEnergyQuantity(log.kwh, "kWh")}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {log.odometer_value.toLocaleString("pt-BR")} km
                  {log.battery_percent !== null ? ` · ${log.battery_percent}%` : ""}
                  {log.consumption_km_kwh !== null ? ` · ${log.consumption_km_kwh.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km/kWh` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-slate-800">{formatBrzlCents(log.total_amount)}</p>
                <p className="mt-1 text-xs text-slate-500">{date.format(new Date(log.recorded_at))}</p>
              </div>
            </li>
          ))}
        </HistoryCard>
      </div>
    </VehicleLogPage>
  );
}

function SectionHeading({ icon: Icon, title }: { icon: typeof Fuel; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-5 w-5 text-accent" aria-hidden="true" />
      <h2 className="text-lg font-semibold">{title}</h2>
    </div>
  );
}

function HistoryCard({ title, isEmpty, empty, children }: { title: string; isEmpty: boolean; empty: string; children: ReactNode }) {
  return (
    <Card className="border-rose-100 bg-white/90">
      <CardContent className="p-6 sm:p-7">
        <h2 className="text-lg font-semibold">{title}</h2>
        {isEmpty ? (
          <VehicleLogEmpty title="Nada por aqui" message={empty} />
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">{children}</ul>
        )}
      </CardContent>
    </Card>
  );
}