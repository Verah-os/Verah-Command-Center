import { Wrench } from "lucide-react";
import { RegisterVehicleMaintenanceForm } from "@/components/customer/vehicle-log-forms";
import { VehicleLogPage } from "@/components/customer/vehicle-log-page";
import { VehicleLogEmpty } from "@/components/customer/vehicle-log-nav";
import { Card, CardContent } from "@/components/ui/card";
import { formatBrzlCents, maintenanceTypeLabel } from "@/lib/customer-vehicle-log";
import { requireRole } from "@/services/auth/profile";
import { loadMaintenanceHome } from "@/services/customer-vehicle-log/read";

const date = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
});

export default async function MaintenancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireRole(["customer"]);
  const [{ id }, feedback] = await Promise.all([params, searchParams]);
  const { vehicle, maintenanceRecords, reminder } = await loadMaintenanceHome(id);

  return (
    <VehicleLogPage vehicle={vehicle} active="maintenance" feedback={feedback}>
      {reminder && (
        <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900">
          Próximo cuidado: {reminder}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-rose-100 bg-white/90">
          <CardContent className="p-6 sm:p-7">
            <div className="flex items-center gap-3">
              <Wrench className="h-5 w-5 text-accent" aria-hidden="true" />
              <h2 className="text-lg font-semibold">Registrar manutenção</h2>
            </div>
            <RegisterVehicleMaintenanceForm vehicleId={vehicle.id} defaultOdometer={vehicle.currentMileage} />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-rose-100 bg-white/90">
            <CardContent className="p-6 sm:p-7">
              <h2 className="text-lg font-semibold">Histórico de manutenções</h2>
              {maintenanceRecords.length ? (
                <ul className="mt-2 divide-y divide-slate-100">
                  {maintenanceRecords.map((record) => (
                    <li key={record.id} className="py-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold">{maintenanceTypeLabel(record.maintenance_type)}</p>
                        <p className="text-sm text-slate-500">{date.format(new Date(record.occurred_on))}</p>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{record.description}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {record.odometer_km.toLocaleString("pt-BR")} km
                        {record.amount_cents !== null ? ` · ${formatBrzlCents(record.amount_cents)}` : ""}
                        {record.next_due_on || record.next_due_km !== null ? ` · próximo: ${record.next_due_on ? date.format(new Date(record.next_due_on)) : ""}${record.next_due_km !== null ? `${record.next_due_on ? " ou " : ""}${record.next_due_km.toLocaleString("pt-BR")} km` : ""}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <VehicleLogEmpty title="Nenhuma manutenção" message="Registre manutenções para preservar o histórico de cuidado do veículo." />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </VehicleLogPage>
  );
}