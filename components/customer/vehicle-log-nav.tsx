import Link from "next/link";
import type { Route } from "next";
import { Car, Clock3, FileText, Fuel, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

export type VehicleLogTab = "" | "mileage" | "fuel" | "expenses" | "maintenance" | "documents";

const tabs: { key: VehicleLogTab; label: string; icon: typeof Car }[] = [
  { key: "", label: "Visão geral", icon: Car },
  { key: "mileage", label: "Quilometragem", icon: Clock3 },
  { key: "fuel", label: "Combustível e energia", icon: Fuel },
  { key: "expenses", label: "Despesas", icon: Wrench },
  { key: "maintenance", label: "Manutenções", icon: Wrench },
  { key: "documents", label: "Documentos", icon: FileText },
];

export function VehicleLogNav({ vehicleId, active }: { vehicleId: string; active: VehicleLogTab }) {
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6">
      <nav aria-label="Registros do veículo" className="-mx-4 mt-4 flex gap-1 overflow-x-auto px-4">
        {tabs.map(({ key, label, icon: Icon }) => {
          const isActive = key === active;
          return (
            <Link
              key={key}
              href={(`/demo/cliente/veiculo/${vehicleId}${key ? `/${key}` : ""}`) as Route}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold outline-none focus-visible:ring-4 focus-visible:ring-rose-200",
                isActive
                  ? "bg-accent/10 text-accent shadow-[inset_0_-2px_0_var(--verah-accent)]"
                  : "text-slate-600 hover:bg-rose-50 hover:text-accent",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function VehicleLogEmpty({ title, message }: { title: string; message: string }) {
  return (
    <Card className="border-rose-100 bg-white/90">
      <CardContent className="p-6 text-center">
        <p className="font-semibold">{title}</p>
        <p className="mt-2 text-sm text-slate-500">{message}</p>
      </CardContent>
    </Card>
  );
}