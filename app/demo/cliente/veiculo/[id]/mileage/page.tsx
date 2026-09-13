import { RegisterVehicleMileageForm } from "@/components/customer/vehicle-log-forms";
import { VehicleLogPage } from "@/components/customer/vehicle-log-page";
import { VehicleLogEmpty } from "@/components/customer/vehicle-log-nav";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/services/auth/profile";
import { listMileageLogs } from "@/services/customer-vehicle-log/read";
import { getCustomerVehicle } from "@/services/customer-vehicles";

const date = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
});

export default async function MileagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireRole(["customer"]);
  const [{ id }, feedback] = await Promise.all([params, searchParams]);
  const vehicle = await getCustomerVehicle(id);
  if (!vehicle) return null;
  const logs = await listMileageLogs(id);

  return (
    <VehicleLogPage vehicle={vehicle} active="mileage" feedback={feedback}>
      <Card className="border-rose-100 bg-white/90">
        <CardContent className="p-6 sm:p-7">
          <h2 className="text-lg font-semibold">Registrar quilometragem</h2>
          <p className="mt-2 text-sm text-slate-500">O hodômetro não pode retroceder: a VERAH mantém o maior valor registrado como referência.</p>
          <RegisterVehicleMileageForm vehicleId={id} defaultValue={vehicle.currentMileage ?? undefined} />
        </CardContent>
      </Card>

      <div className="mt-6">
        {logs.length ? (
          <Card className="border-rose-100 bg-white/90">
            <CardContent className="p-6 sm:p-7">
              <h2 className="text-lg font-semibold">Histórico de quilometragem</h2>
              <ul className="mt-5 divide-y divide-slate-100">
                {logs.map((log) => (
                  <li key={log.id} className="flex flex-wrap items-center justify-between gap-2 py-4">
                    <div>
                      <p className="font-semibold">{log.mileage_value.toLocaleString("pt-BR")} km</p>
                      {log.note ? <p className="mt-1 text-sm text-slate-500">{log.note}</p> : null}
                    </div>
                    <p className="text-sm text-slate-500">{date.format(new Date(log.recorded_at))}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : (
          <VehicleLogEmpty title="Nenhuma leitura registrada" message="Registre a quilometragem atual para começar o histórico de uso do veículo." />
        )}
      </div>
    </VehicleLogPage>
  );
}