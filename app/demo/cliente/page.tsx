import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { DemoShell } from "@/components/demo/demo-shell";
import { listCustomerServiceRequests } from "@/services/service-requests";
import { createSupabaseServerClient } from "@/services/supabase/server";
import { customerStageLabels } from "@/lib/customer-service-stage";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

export default async function CustomerPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const requests = await listCustomerServiceRequests();
  return (
    <DemoShell>
      <section className="mx-auto max-w-5xl px-5 py-12">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-teal-700">
              Sua jornada com a VERAH
            </p>
            <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
              Cuidar do seu veículo pode ser mais simples.
            </h1>
            <p className="mt-3 max-w-2xl text-slate-600">
              Triagem clara, acompanhamento humano e decisões sem pressão.
            </p>
          </div>
          <Link
            href="/demo/cliente/novo-atendimento"
            className="inline-flex min-h-12 items-center justify-center rounded-lg bg-teal-700 px-5 font-semibold text-white"
          >
            Novo atendimento
          </Link>
        </div>
        <div className="mt-12">
          <h2 className="text-xl font-semibold">Seus atendimentos</h2>
          {requests.length ? (
            <div className="mt-5 grid gap-4">
              {requests.map((request) => (
                <Link
                  key={request.id}
                  href={`/demo/cliente/atendimento/${request.id}`}
                >
                  <Card className="transition hover:border-teal-300 hover:shadow-sm">
                    <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-mono text-sm font-semibold text-teal-800">
                          {request.referenceCode}
                        </p>
                        <p className="mt-1 font-medium">
                          {request.vehicleBrand} {request.vehicleModel}
                          {request.vehicleYear
                            ? ` · ${request.vehicleYear}`
                            : ""}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {request.state
                            ? `${request.city}/${request.state}`
                            : request.city}{" "}
                          · {dateFormatter.format(new Date(request.createdAt))}
                        </p>
                      </div>
                      <span className="w-fit rounded-full bg-teal-50 px-3 py-1 text-sm font-medium text-teal-800">
                        {customerStageLabels[request.serviceStage]}
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <Card className="mt-5 border-dashed">
              <CardContent className="p-8 text-center">
                <p className="font-medium">Nenhum atendimento criado ainda.</p>
                <p className="mt-2 text-sm text-slate-500">
                  Quando precisar, estaremos aqui para organizar o próximo
                  passo.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </DemoShell>
  );
}
