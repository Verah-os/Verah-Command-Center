import { Wallet } from "lucide-react";
import { RegisterVehicleExpenseForm } from "@/components/customer/vehicle-log-forms";
import { VehicleLogPage } from "@/components/customer/vehicle-log-page";
import { VehicleLogEmpty } from "@/components/customer/vehicle-log-nav";
import { Card, CardContent } from "@/components/ui/card";
import { formatBrzlCents, formatPlainDate } from "@/lib/customer-vehicle-log";
import { requireRole } from "@/services/auth/profile";
import { loadExpensesHome } from "@/services/customer-vehicle-log/read";

const categoryLabels: Record<string, string> = {
  combustivel: "Combustível",
  manutencao: "Manutenção",
  outros: "Outros",
};

export default async function ExpensesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireRole(["customer"]);
  const [{ id }, feedback] = await Promise.all([params, searchParams]);
  const { vehicle, expenses, summary } = await loadExpensesHome(id);

  return (
    <VehicleLogPage vehicle={vehicle} active="expenses" feedback={feedback}>
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-rose-100 bg-white/90">
          <CardContent className="p-6 sm:p-7">
            <div className="flex items-center gap-3">
              <Wallet className="h-5 w-5 text-accent" aria-hidden="true" />
              <h2 className="text-lg font-semibold">Registrar despesa</h2>
            </div>
            <RegisterVehicleExpenseForm vehicleId={vehicle.id} defaultOdometer={vehicle.currentMileage} />
          </CardContent>
        </Card>

        <Card className="border-rose-100 bg-rose-50/60">
          <CardContent className="p-6 sm:p-7">
            {summary && summary.expense_count > 0 ? (
              <>
                <h2 className="text-lg font-semibold">Resumo de custos</h2>
                <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                  <SummaryFact label="Total gasto" value={formatBrzlCents(summary.total_cents)} />
                  <SummaryFact label="Combustível" value={formatBrzlCents(summary.fuel_cents)} />
                  <SummaryFact label="Manutenção" value={formatBrzlCents(summary.maintenance_cents)} />
                  <SummaryFact label="Outros" value={formatBrzlCents(summary.other_cents)} />
                  {summary.cost_per_km_cents !== null && summary.distance_km !== null && summary.distance_km > 0 ? (
                    <SummaryFact label="Custo por km" value={`${formatBrzlCents(summary.cost_per_km_cents)}/km`} wide />
                  ) : (
                    <SummaryFact label="Custo por km" value="Ainda não disponível" wide />
                  )}
                </dl>
              </>
            ) : (
              <VehicleLogEmpty title="Sem despesas ainda" message="O resumo de custos aparece assim que houver os primeiros lançamentos." />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        {expenses.length ? (
          <Card className="border-rose-100 bg-white/90">
            <CardContent className="p-6 sm:p-7">
              <h2 className="text-lg font-semibold">Lançamentos</h2>
              <ul className="mt-2 divide-y divide-slate-100">
                {expenses.map((expense) => (
                  <li key={expense.id} className="flex flex-wrap items-center justify-between gap-2 py-4">
                    <div>
                      <p className="font-semibold">{categoryLabels[expense.category] ?? expense.category}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {expense.description ? `${expense.description} · ` : ""}
                        {expense.odometer_km !== null ? `${expense.odometer_km.toLocaleString("pt-BR")} km · ` : ""}
                        {formatPlainDate(expense.occurred_on)}
                      </p>
                    </div>
                    <p className="font-semibold text-slate-800">{formatBrzlCents(expense.amount_cents)}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : (
          <VehicleLogEmpty title="Nenhum lançamento" message="Registre despesas para acompanhar os custos do veículo." />
        )}
      </div>
    </VehicleLogPage>
  );
}

function SummaryFact({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-slate-800">{value}</dd>
    </div>
  );
}