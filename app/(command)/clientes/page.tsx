import Link from "next/link";
import type { Metadata } from "next";
import { Input, Alert } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/state/empty-state";
import {
  crmDate,
  crmLink,
  SourceNotice,
} from "@/components/customer-crm/panels";
import { getCustomerDirectory } from "@/services/customer-crm/service";
import { searchDirectory } from "@/services/customer-crm/read-model";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Clientes | VERAH Command Center",
  robots: { index: false, follow: false },
};

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>;
}) {
  const directory = await getCustomerDirectory();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 120) : "";
  const page = typeof params.page === "string" ? Number(params.page) : 1;
  const result = searchDirectory(directory, q, page);
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Clientes</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Identidades canônicas da VERAH · leitura administrativa
        </p>
      </header>
      <form action="/clientes" method="get" className="space-y-2">
        <label htmlFor="customer-search" className="text-sm font-medium">
          Buscar por nome ou contato WhatsApp
        </label>
        <div className="flex flex-wrap gap-3">
          <Input
            id="customer-search"
            name="q"
            type="search"
            maxLength={120}
            defaultValue={q}
            placeholder="Nome ou telefone cadastrado…"
            autoComplete="off"
            className="min-w-0 flex-1 basis-64"
          />
          <Button type="submit">Buscar clientes</Button>
          <Link href="/clientes" prefetch={false} className={crmLink}>
            Limpar busca
          </Link>
        </div>
      </form>
      {directory.contacts.status === "unavailable" ? (
        <Alert>
          Contatos indisponíveis: a busca considera apenas nomes. Resultados por
          telefone podem estar ausentes.
        </Alert>
      ) : null}
      {!result ? (
        <SourceNotice title="Lista de clientes indisponível" />
      ) : result.rows.length === 0 ? (
        <EmptyState
          title={
            q ? "Nenhuma cliente encontrada" : "Nenhuma cliente cadastrada"
          }
          description={
            q
              ? "Revise o nome ou telefone e tente novamente. Apenas registros autorizados entram na busca."
              : "Clientes aparecerão aqui quando houver identidades canônicas acessíveis. Nenhum cadastro demonstrativo foi adicionado."
          }
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {result.total.toLocaleString("pt-BR")} resultado(s) · página{" "}
            {result.page} de {result.pages}
          </p>
          <ul className="grid gap-3 lg:grid-cols-2">
            {result.rows.map((customer) => (
              <li
                key={customer.id}
                className="min-w-0 rounded-lg border border-border bg-card p-5"
              >
                <h2 className="break-words text-lg font-semibold">
                  {customer.display_name}
                </h2>
                <p className="text-xs text-muted-foreground">
                  Cadastro: {crmDate(customer.created_at)}
                </p>
                {directory.contacts.status === "available" ? (
                  <p className="mt-3 break-all text-sm">
                    {directory.contacts.data
                      .filter((c) => c.customer_id === customer.id)
                      .map((c) => c.channel_address)
                      .join(" · ") || "Contato não cadastrado"}
                  </p>
                ) : (
                  <p className="mt-3 text-sm">Contato indisponível</p>
                )}
                <Link
                  href={`/clientes/${customer.id}`}
                  prefetch={false}
                  className={`${crmLink} mt-3`}
                  aria-label={`Abrir ficha de ${customer.display_name}`}
                >
                  Abrir Cliente 360° →
                </Link>
              </li>
            ))}
          </ul>
          <nav
            aria-label="Páginas de clientes"
            className="flex flex-wrap gap-3"
          >
            {result.page > 1 ? (
              <Link
                className={crmLink}
                href={`/clientes?q=${encodeURIComponent(q)}&page=${result.page - 1}`}
                prefetch={false}
              >
                ← Anterior
              </Link>
            ) : null}
            {result.page < result.pages ? (
              <Link
                className={crmLink}
                href={`/clientes?q=${encodeURIComponent(q)}&page=${result.page + 1}`}
                prefetch={false}
              >
                Próxima →
              </Link>
            ) : null}
          </nav>
        </>
      )}
    </div>
  );
}
