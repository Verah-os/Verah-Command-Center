import type { ReactNode } from "react";
import { CarFront } from "lucide-react";
import { CustomerShell } from "@/components/customer/customer-shell";
import { VehicleLogNav, type VehicleLogTab } from "@/components/customer/vehicle-log-nav";
import { maskPlate, vehicleName } from "@/lib/customer-vehicle";
import type { CustomerVehicle } from "@/types/customer-vehicle";

export function VehicleLogPage({
  vehicle,
  active,
  feedback,
  children,
}: {
  vehicle: CustomerVehicle;
  active: VehicleLogTab;
  feedback: { saved?: string; error?: string } | null;
  children: ReactNode;
}) {
  return (
    <CustomerShell>
      <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-accent">
              <CarFront className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-rose-700">{vehicle.nickname ?? "Meu veículo"}</p>
              <h1 className="mt-1 text-3xl font-semibold">{vehicleName(vehicle)}</h1>
              <p className="mt-2 text-sm text-slate-500">Placa {maskPlate(vehicle.plate)}</p>
            </div>
          </div>
        </div>

        {(feedback?.saved || feedback?.error) && (
          <p role="status" className={`mt-5 rounded-xl border p-4 text-sm ${feedback.error ? "border-rose-200 bg-rose-50 text-rose-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
            {feedback.error ?? feedback.saved}
          </p>
        )}

        <VehicleLogNav vehicleId={vehicle.id} active={active} />
        <div className="mt-6">{children}</div>
      </section>
    </CustomerShell>
  );
}