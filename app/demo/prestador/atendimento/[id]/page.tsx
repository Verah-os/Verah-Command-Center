import { notFound } from "next/navigation";
import { DemoShell } from "@/components/demo/demo-shell";
import { QuoteForm } from "@/components/demo/quote-form";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/services/auth/profile";
import { providerComplete } from "@/services/service-completion";
import { getActiveProvider } from "@/services/service-providers";
import { getQuoteForRequest } from "@/services/service-quotes";
import { getProviderServiceRequest } from "@/services/service-requests";

const timeline = [
  "Solicitado",
  "Concierge aceitou",
  "Prestador indicado",
  "Aguardando aprovação",
  "Em execução",
  "Concluído",
];

export default async function ProviderRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ provider?: string }>;
}) {
  const profile = await requireRole(["provider", "admin"]);
  const { id } = await params;
  const { provider: requestedProviderId } = await searchParams;
  const providerId =
    profile.role === "provider" ? profile.providerId : requestedProviderId;

  if (profile.role === "provider" && !providerId) {
    return (
      <OperationalError message="Seu perfil não está vinculado a um prestador. Solicite ao administrador a correção do cadastro." />
    );
  }
  if (!providerId) notFound();
  if (profile.role === "admin" && !(await getActiveProvider(providerId)))
    notFound();

  const request = await getProviderServiceRequest(id, providerId);
  if (!request) notFound();
  const quote = await getQuoteForRequest(id);
  const stages = [
    "solicitado",
    "concierge_aceitou",
    "prestador_indicado",
    "aguardando_aprovacao",
    "em_execucao",
    "concluido",
  ];
  const current = Math.max(0, stages.indexOf(request.serviceStage));

  return (
    <DemoShell>
      <section className="mx-auto max-w-4xl px-5 py-10">
        <p className="font-mono text-sm font-semibold text-teal-800">
          {request.referenceCode}
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Briefing do atendimento</h1>
        <div className="mt-8 grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="space-y-5">
            <Card>
              <CardContent className="space-y-5 p-6">
                <Info
                  label="Veículo"
                  value={`${request.vehicleBrand} ${request.vehicleModel}${request.vehicleYear ? ` · ${request.vehicleYear}` : ""}`}
                />
                <Info label="Cidade" value={request.city} />
                <Info label="Urgência" value={request.perceivedUrgency} />
                <Info
                  label="Briefing técnico"
                  value={
                    request.copilotProviderBrief ?? "Revisão técnica necessária"
                  }
                />
              </CardContent>
            </Card>
            {request.serviceStage === "prestador_indicado" &&
            (!quote || quote.status === "draft") ? (
              <Card>
                <CardContent className="p-6">
                  <h2 className="mb-4 text-xl font-semibold">
                    Preparar orçamento
                  </h2>
                  <QuoteForm
                    requestId={id}
                    providerId={providerId}
                    initial={quote}
                  />
                </CardContent>
              </Card>
            ) : (
              quote && <QuoteView quote={quote} />
            )}
            {request.serviceStage === "em_execucao" && (
              <Card>
                <CardContent className="space-y-4 p-6">
                  <h2 className="text-xl font-semibold">Finalizar serviço</h2>
                  {request.providerCompletedAt ? (
                    <p className="rounded bg-emerald-50 p-3 text-sm text-emerald-900">
                      Serviço finalizado pelo prestador. Aguardando confirmação
                      do Concierge.
                    </p>
                  ) : (
                    <form action={providerComplete} className="space-y-3">
                      <input
                        type="hidden"
                        name="requestId"
                        value={request.id}
                      />
                      <input
                        type="hidden"
                        name="providerId"
                        value={providerId}
                      />
                      <ul className="text-sm text-slate-600">
                        <li>✓ Serviço executado</li>
                        <li>✓ Veículo revisado</li>
                        <li>✓ Cliente/Concierge informado</li>
                      </ul>
                      <textarea
                        name="notes"
                        className="w-full rounded border p-2"
                        placeholder="Observações finais opcionais"
                      />
                      <button className="rounded bg-teal-700 px-4 py-2 text-white">
                        Marcar serviço como finalizado
                      </button>
                    </form>
                  )}
                </CardContent>
              </Card>
            )}
            <p className="rounded-xl bg-amber-50 p-5 text-sm text-amber-900">
              O orçamento deve ser aprovado antes do início da execução.
            </p>
          </div>
          <Card>
            <CardContent className="p-6">
              <h2 className="font-semibold">Timeline</h2>
              <ol className="mt-5 space-y-4">
                {timeline.map((item, index) => (
                  <li key={item} className="flex items-center gap-3 text-sm">
                    <span
                      className={`h-3 w-3 rounded-full ${index <= current ? "bg-teal-700" : "bg-slate-200"}`}
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </section>
    </DemoShell>
  );
}

function OperationalError({ message }: { message: string }) {
  return (
    <DemoShell>
      <section className="mx-auto max-w-3xl px-5 py-16">
        <Card>
          <CardContent className="p-8">
            <h1 className="text-xl font-semibold">
              Não foi possível abrir o atendimento
            </h1>
            <p className="mt-3 text-sm text-slate-600">{message}</p>
          </CardContent>
        </Card>
      </section>
    </DemoShell>
  );
}
function QuoteView({
  quote,
}: {
  quote: Awaited<ReturnType<typeof getQuoteForRequest>>;
}) {
  if (!quote) return null;
  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <h2 className="text-xl font-semibold">
          Orçamento · {quote.status.replaceAll("_", " ")}
        </h2>
        {quote.items.map((item) => (
          <p key={item.id}>
            {item.description}: {money(item.totalPrice)}
          </p>
        ))}
        <p className="text-lg font-semibold">
          Total: {money(quote.totalAmount)}
        </p>
        {quote.submittedAt && (
          <p className="text-sm text-slate-500">Enviado para aprovação.</p>
        )}
      </CardContent>
    </Card>
  );
}
const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{value}</p>
    </div>
  );
}
