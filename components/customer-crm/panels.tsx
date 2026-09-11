import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert, Badge } from "@/components/ui/primitives";
import { customerStageLabels } from "@/lib/customer-service-stage";
import type {
  CustomerDetail,
  Metrics,
  Source,
} from "@/services/customer-crm/read-model";

export const crmLink =
  "inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-primary underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary hover:bg-muted";
const number = (n: number) => n.toLocaleString("pt-BR");
export function crmDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}
export function SourceNotice({
  title = "Fonte indisponível",
}: {
  title?: string;
}) {
  return (
    <Alert>
      <strong>{title}.</strong> Não foi possível confirmar os dados com as
      permissões atuais. Recarregue a página; se persistir, peça ao responsável
      para verificar o contrato de leitura. Nenhum valor foi estimado.
    </Alert>
  );
}
function Metric({ label, value }: { label: string; value: Source<number> }) {
  return (
    <Card>
      <CardHeader>
        <h3 className="text-sm text-muted-foreground">{label}</h3>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">
          {value.status === "available" ? number(value.data) : "Indisponível"}
        </p>
      </CardContent>
    </Card>
  );
}
export function CustomerMetrics({ metrics }: { metrics: Metrics }) {
  const unavailable = [
    metrics.customers,
    metrics.newCustomers,
    metrics.activeCustomers,
    metrics.vehicles,
    metrics.openRequests,
  ].some((s) => s.status === "unavailable");
  return (
    <section aria-labelledby="crm-metrics" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="crm-metrics" className="text-xl font-semibold">
            Clientes e operação
          </h2>
          <p className="text-sm text-muted-foreground">
            Leitura canônica · acesso administrativo · sem ações operacionais
          </p>
        </div>
        <Link className={crmLink} href="/clientes" prefetch={false}>
          Abrir Clientes →
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Clientes cadastrados" value={metrics.customers} />
        <Metric label="Novos no mês (UTC)" value={metrics.newCustomers} />
        <Metric label="Clientes ativos" value={metrics.activeCustomers} />
        <Metric label="Veículos cadastrados" value={metrics.vehicles} />
        <Metric label="Solicitações abertas" value={metrics.openRequests} />
      </div>
      <p className="text-xs text-muted-foreground">
        Ativa = cliente com ao menos uma solicitação vinculada por identidade
        canônica nas etapas solicitado, concierge aceitou, prestador indicado,
        aguardando aprovação ou em execução. Concluídas e canceladas não contam.
        Mês de referência:{" "}
        {new Intl.DateTimeFormat("pt-BR", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(metrics.period))}
        . Veículos incluem ativos e inativos.
      </p>
      {unavailable ? (
        <SourceNotice title="Um ou mais indicadores estão indisponíveis" />
      ) : null}
    </section>
  );
}
export function CustomerOverview({ detail }: { detail: CustomerDetail }) {
  const { customer, contacts, vehicles, requests, events } = detail;
  const last = events.status === "available" ? events.data[0] : null;
  return (
    <div className="space-y-6">
      <header>
        <Link href="/clientes" prefetch={false} className={crmLink}>
          ← Clientes
        </Link>
        <h1 className="mt-3 break-words text-2xl font-semibold">
          {customer.display_name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Cliente 360° · somente leitura
        </p>
        <p className="mt-2 break-all text-xs text-muted-foreground">
          Identidade canônica: {customer.id}
        </p>
        <p className="text-sm text-muted-foreground">
          Cadastro: {crmDate(customer.created_at)}
        </p>
      </header>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Contato cadastrado</h2>
          </CardHeader>
          <CardContent>
            {contacts.status === "unavailable" ? (
              <SourceNotice />
            ) : contacts.data.length === 0 ? (
              <p>Nenhum contato WhatsApp cadastrado.</p>
            ) : (
              <ul className="space-y-3">
                {contacts.data.map((c) => (
                  <li key={c.id}>
                    <p className="break-all">{c.channel_address}</p>
                    <p className="text-xs text-muted-foreground">
                      Consentimento:{" "}
                      {c.consent_status === "granted"
                        ? "concedido"
                        : c.consent_status === "revoked"
                          ? "revogado"
                          : "não informado"}
                      . Nenhuma mensagem será enviada nesta área.
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Última interação derivável</h2>
          </CardHeader>
          <CardContent>
            {events.status === "unavailable" ? (
              <SourceNotice title="Histórico indisponível" />
            ) : last ? (
              <>
                <p>{crmDate(last.created_at)}</p>
                <p className="break-words text-sm">
                  {last.event_type} · {last.actor_role} · {last.channel}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Último evento operacional registrado. Pode ser automático; não
                  comprova contato humano com a cliente.
                </p>
              </>
            ) : (
              <p>Nenhum evento disponível para derivar uma interação.</p>
            )}
          </CardContent>
        </Card>
      </div>
      <section aria-labelledby="crm-vehicles" className="space-y-3">
        <h2 id="crm-vehicles" className="text-xl font-semibold">
          Veículos
        </h2>
        <p className="text-sm text-muted-foreground">
          Somente vínculos por customer_id. Registros legados sem esse vínculo
          não são associados por nome, placa ou login nesta V1.
        </p>
        {vehicles.status === "unavailable" ? (
          <SourceNotice />
        ) : vehicles.data.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6">
            Nenhum veículo com vínculo canônico disponível.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {vehicles.data.map((v) => (
              <Card key={v.id}>
                <CardHeader>
                  <h3 className="break-words font-semibold">
                    {v.brand} {v.model}
                  </h3>
                </CardHeader>
                <CardContent>
                  <p>
                    {v.year ?? "Ano não informado"} ·{" "}
                    {v.plate ?? "Placa não informada"}
                  </p>
                  <p className="text-sm">
                    Quilometragem:{" "}
                    {v.current_mileage === null
                      ? "não informada"
                      : `${number(v.current_mileage)} km`}
                  </p>
                  <Badge>{v.active ? "Ativo" : "Inativo"}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
      <section aria-labelledby="crm-requests" className="space-y-3">
        <h2 id="crm-requests" className="text-xl font-semibold">
          Solicitações de serviço
        </h2>
        {requests.status === "unavailable" ? (
          <SourceNotice />
        ) : requests.data.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6">
            Nenhuma solicitação vinculada a esta identidade canônica. Registros
            sem customer_id não são associados por contato ou pelo criador.
          </p>
        ) : (
          <ul className="space-y-3">
            {[...requests.data]
              .sort(
                (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
              )
              .map((r) => {
                const vehicle =
                  vehicles.status === "available"
                    ? vehicles.data.find((v) => v.id === r.vehicle_id)
                    : null;
                return (
                  <li
                    key={r.id}
                    className="rounded-lg border border-border bg-card p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="break-all font-semibold">
                        {r.reference_code}
                      </h3>
                      <Badge>{customerStageLabels[r.service_stage]}</Badge>
                    </div>
                    <p className="mt-2 text-sm">
                      Veículo:{" "}
                      {vehicle
                        ? `${vehicle.brand} ${vehicle.model}`
                        : "vínculo não disponível nesta ficha"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Criada: {crmDate(r.created_at)} · Atualizada:{" "}
                      {crmDate(r.updated_at)}
                    </p>
                    <Link
                      href={`/concierge/${r.id}`}
                      prefetch={false}
                      className={crmLink}
                    >
                      Consultar atendimento existente
                    </Link>
                  </li>
                );
              })}
          </ul>
        )}
      </section>
      <section aria-labelledby="crm-history" className="space-y-3">
        <h2 id="crm-history" className="text-xl font-semibold">
          Histórico operacional
        </h2>
        <p className="text-sm text-muted-foreground">
          Metadados dos eventos canônicos das solicitações acima. Sem conteúdo
          de mensagens, payloads, margens ou ranking de prestadores.
        </p>
        {events.status === "unavailable" ? (
          <SourceNotice />
        ) : events.data.length === 0 ? (
          <p>Nenhum evento registrado disponível.</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Exibindo os {Math.min(50, events.data.length)} eventos mais
              recentes de {number(events.data.length)}.
            </p>
            <ol className="space-y-3 border-l border-border pl-5">
              {events.data.slice(0, 50).map((e) => (
                <li key={e.id} className="break-words">
                  <p className="text-sm font-medium">{e.event_type}</p>
                  <p className="text-xs text-muted-foreground">
                    {crmDate(e.created_at)} · {e.actor_role} · {e.channel} ·{" "}
                    {requests.status === "available"
                      ? requests.data.find((r) => r.id === e.service_request_id)
                          ?.reference_code
                      : "Solicitação"}
                  </p>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>
      <Card>
        <CardHeader>
          <h2 className="font-semibold">Próximas integrações do CRM</h2>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Orçamentos, pagamentos, planos, documentos e pós-venda:
            indisponíveis nesta ficha V1. Nenhum contrato paralelo ou ação
            operacional foi criado para preencher essas lacunas.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
