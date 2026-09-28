import Link from "next/link";
import { requireRole } from "@/services/auth/profile";
import {
  approvalBlockers,
  getHomologationDetail,
  listHomologationProviders,
  reviews,
  statuses,
  type Detail,
} from "@/services/provider-homologation/service";
import { submitHomologation } from "./actions";

export const dynamic = "force-dynamic";
const inputClass =
  "mt-1 block min-h-11 w-full rounded-md border border-border bg-background px-3 py-2";
const buttonClass =
  "min-h-11 rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50";
const labels: Record<string, string> = {
  candidate: "Candidato",
  documents_pending: "Documentos pendentes",
  under_review: "Em análise",
  pilot_approved: "Aprovado para piloto",
  approved: "Aprovado",
  suspended: "Suspenso",
  rejected: "Rejeitado",
  expired: "Vencido",
  pending: "Pendente",
  verified: "Verificado",
  not_applicable: "Não aplicável",
  company_registration: "Registro da empresa",
  cadastral_data: "Dados cadastrais",
  operational_address: "Endereço operacional",
  responsible_person: "Responsável",
  fiscal_documentation: "Documentação fiscal",
  banking_reference: "Referência bancária",
  contract_acceptance: "Aceite contratual",
  warranty_policy: "Política de garantia",
  capacity_evidence: "Capacidade operacional",
  verah_inspection: "Inspeção VERAH",
  pilot_service: "Atendimento piloto",
  final_human_approval: "Aprovação humana final",
};
function Field({
  name,
  title,
  required = false,
  defaultValue,
  type = "text",
}: {
  name: string;
  title: string;
  required?: boolean;
  defaultValue?: string | null;
  type?: string;
}) {
  return (
    <label className="block text-sm">
      {title}
      <input
        className={inputClass}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue ?? undefined}
      />
    </label>
  );
}
function State({
  values,
  selected,
}: {
  values: readonly string[];
  selected?: string;
}) {
  return (
    <label className="block text-sm">
      Estado
      <select name="status" defaultValue={selected} className={inputClass}>
        {values.map((status) => (
          <option key={status} value={status}>
            {labels[status]}
          </option>
        ))}
      </select>
    </label>
  );
}
function Context({ id, operation }: { id: string; operation: string }) {
  return (
    <>
      <input type="hidden" name="provider_id" value={id} />
      <input type="hidden" name="operation" value={operation} />
    </>
  );
}
function Reason() {
  return (
    <Field name="reason" title="Justificativa da revisão humana" required />
  );
}

function ProviderDetail({ detail }: { detail: Detail }) {
  const { provider, profile, checklist, categories } = detail;
  const blockers = approvalBlockers(detail);
  return (
    <article className="space-y-6 rounded-xl border border-border bg-card p-5">
      <header>
        <h2 className="text-xl font-semibold">{provider.name}</h2>
        <p className="break-all text-sm">{provider.id}</p>
        <p>
          {provider.city} · Situação operacional: {provider.status}
        </p>
        <p>
          Homologação:{" "}
          {profile
            ? labels[profile.homologation_status]
            : "Perfil ausente — cadastro em análise"}
        </p>
        <p>Próxima revisão: {profile?.next_review_at ?? "Não definida"}</p>
        <p>
          Última justificativa: {profile?.status_reason ?? "Não registrada"}
        </p>
      </header>
      <section
        aria-label="Bloqueios e requisitos"
        className="rounded-md border border-border p-4"
      >
        <h3 className="font-semibold">Requisitos para aprovação nesta área</h3>
        {blockers.length ? (
          <ul className="list-disc pl-5">
            {blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        ) : (
          <p>
            Requisitos carregados sem pendências. A decisão exige revisão humana
            e validação final pelo servidor.
          </p>
        )}
        <p className="mt-2 text-sm">
          A homologação não atribui atendimentos. A elegibilidade depende também
          da categoria exata do serviço e das validades no momento da operação.
        </p>
      </section>
      {!profile ? (
        <form action={submitHomologation} className="space-y-3">
          <Context id={provider.id} operation="initialize" />
          <h3 className="font-semibold">Iniciar perfil e checklist</h3>
          <Field name="legal_name" title="Razão social confirmada" required />
          <Field
            name="registration_reference"
            title="Referência cadastral confirmada"
            required
          />
          <Field name="address" title="Endereço operacional" required />
          <Field name="responsible_person" title="Responsável" required />
          <Field name="contact" title="Contato operacional" required />
          <Reason />
          <button className={buttonClass}>Iniciar análise</button>
        </form>
      ) : (
        <>
          <section className="space-y-3">
            <h3 className="text-lg font-semibold">Checklist e evidências</h3>
            <p className="text-sm">
              Use o identificador de uma evidência privada já disponível e
              vinculada a este prestador. Não use URL pública. Os requisitos
              obrigatórios são preservados.
            </p>
            {!checklist.length && (
              <p role="alert">
                Checklist ausente. Aprovação indisponível; encaminhe para
                revisão do cadastro canônico.
              </p>
            )}
            {checklist.map((item) => (
              <details
                key={item.item_code}
                className="rounded-md border border-border p-3"
              >
                <summary className="cursor-pointer">
                  {labels[item.item_code] ?? item.item_code} ·{" "}
                  {labels[item.review_status]} ·{" "}
                  {item.is_required_for_pilot ? "Obrigatório" : "Opcional"}
                </summary>
                <form action={submitHomologation} className="mt-3 space-y-3">
                  <Context id={provider.id} operation="checklist" />
                  <input
                    type="hidden"
                    name="item_code"
                    value={item.item_code}
                  />
                  <p>
                    Evidência:{" "}
                    {item.evidence_required
                      ? "Exigida para verificação obrigatória"
                      : "Dispensável"}
                  </p>
                  <p>
                    Validade atual:{" "}
                    {item.valid_until ?? "Sem vencimento informado"}
                  </p>
                  <p>Nota: {item.note ?? "Não registrada"}</p>
                  <State values={reviews} selected={item.review_status} />
                  <Field
                    name="evidence_ref"
                    title="Identificador da evidência privada"
                    defaultValue={item.evidence_ref}
                  />
                  <Field
                    name="valid_until"
                    title="Validade (UTC; vazio remove vencimento)"
                    type="datetime-local"
                    defaultValue={item.valid_until?.slice(0, 16)}
                  />
                  <Reason />
                  <button className={buttonClass}>Registrar revisão</button>
                </form>
              </details>
            ))}
          </section>
          <section className="space-y-3">
            <h3 className="text-lg font-semibold">Categorias autorizadas</h3>
            {categories.length ? (
              <ul>
                {categories.map((category) => (
                  <li key={category.category_code}>
                    {category.category_code} ·{" "}
                    {labels[category.authorization_status]} · validade:{" "}
                    {category.valid_until ?? "Sem vencimento"} ·{" "}
                    {category.reason}
                  </li>
                ))}
              </ul>
            ) : (
              <p>Nenhuma categoria registrada.</p>
            )}
            <form action={submitHomologation} className="space-y-3">
              <Context id={provider.id} operation="category" />
              <Field
                name="category_code"
                title="Código canônico da categoria do serviço"
                required
              />
              <State values={statuses} />
              <Field
                name="valid_until"
                title="Validade (UTC)"
                type="datetime-local"
              />
              <Reason />
              <button className={buttonClass}>
                Registrar decisão da categoria
              </button>
            </form>
          </section>
          <section>
            <h3 className="text-lg font-semibold">Bloqueio operacional</h3>
            <p>
              {profile.critical_operational_block
                ? "Bloqueio crítico ativo"
                : "Sem bloqueio crítico"}
            </p>
            <form action={submitHomologation} className="mt-3 space-y-3">
              <Context id={provider.id} operation="block" />
              <input
                type="hidden"
                name="blocked"
                value={String(!profile.critical_operational_block)}
              />
              <Reason />
              <button className={buttonClass}>
                {profile.critical_operational_block
                  ? "Remover bloqueio após revisão"
                  : "Registrar bloqueio"}
              </button>
            </form>
          </section>
          <section>
            <h3 className="text-lg font-semibold">Decisão de homologação</h3>
            <p className="text-sm">
              Aprovado para piloto e Aprovado exigem checklist válido. Esta área
              também impede aprovação sem categoria válida, com prestador
              inativo ou bloqueio crítico.
            </p>
            <form action={submitHomologation} className="mt-3 space-y-3">
              <Context id={provider.id} operation="status" />
              <State
                values={statuses.filter(
                  (status) =>
                    !blockers.length ||
                    !["pilot_approved", "approved"].includes(status),
                )}
                selected={profile.homologation_status}
              />
              <Field
                name="next_review_at"
                title="Próxima revisão (UTC)"
                type="datetime-local"
                defaultValue={profile.next_review_at?.slice(0, 16)}
              />
              <Reason />
              <button className={buttonClass}>Registrar decisão humana</button>
            </form>
          </section>
        </>
      )}
    </article>
  );
}

export default async function ProvidersPage({
  searchParams,
}: {
  searchParams: Promise<{ provider?: string; q?: string; feedback?: string }>;
}) {
  await requireRole(["admin"]);
  const params = await searchParams;
  let providers;
  let detail: Detail | null = null;
  try {
    providers = await listHomologationProviders();
    if (params.provider) detail = await getHomologationDetail(params.provider);
  } catch {
    return (
      <section role="alert">
        <h1 className="text-2xl font-semibold">Prestadores / Homologação</h1>
        <p>
          Não foi possível carregar a homologação. Isso não significa lista
          vazia. Nenhuma ação está disponível até uma leitura válida.
        </p>
        <Link href="/prestadores">Tentar novamente</Link>
      </section>
    );
  }
  const query = params.q?.trim().toLocaleLowerCase("pt-BR") ?? "";
  const filtered = providers.filter((provider) =>
    `${provider.name} ${provider.trade_name ?? ""} ${provider.id}`
      .toLocaleLowerCase("pt-BR")
      .includes(query),
  );
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Prestadores / Homologação</h1>
        <p>
          Revisão administrativa canônica. Estar ativo não significa estar
          homologado.
        </p>
      </header>
      {params.feedback === "saved" && (
        <p role="status">Operação confirmada. Dados recarregados.</p>
      )}
      {params.feedback === "failed" && (
        <p role="alert">
          Operação não confirmada. Confira requisitos, categoria, bloqueios,
          evidência privada e autorização Admin. Recarregue antes de tentar
          novamente.
        </p>
      )}
      <form className="flex items-end gap-3">
        <div className="flex-1">
          <Field
            name="q"
            title="Buscar por nome ou identificador do prestador"
            defaultValue={params.q}
          />
        </div>
        <button className={buttonClass}>Buscar</button>
      </form>
      <ul className="space-y-2">
        {filtered.map((provider) => (
          <li key={provider.id}>
            <Link
              className="block rounded-md border border-border p-3 hover:bg-muted"
              href={`/prestadores?provider=${provider.id}`}
            >
              {provider.name} · {provider.city} · {provider.status}
              <span className="block break-all text-xs">{provider.id}</span>
            </Link>
          </li>
        ))}
      </ul>
      {!filtered.length && (
        <p>Nenhum prestador encontrado nesta consulta concluída.</p>
      )}
      {detail && <ProviderDetail detail={detail} />}
    </div>
  );
}
