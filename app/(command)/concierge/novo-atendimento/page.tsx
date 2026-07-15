import Link from "next/link";
import type { Route } from "next";
import { ServiceRequestForm } from "@/components/demo/service-request-form";
import { requireRole } from "@/services/auth/profile";

export default async function NewConciergeServiceRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireRole(["concierge", "admin"]);
  const { error } = await searchParams;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <Link
          href={"/concierge" as Route}
          className="text-sm font-medium text-primary hover:underline"
        >
          ← Voltar aos atendimentos
        </Link>
        <p className="mt-4 text-sm text-muted-foreground">
          Criação operacional
        </p>
        <h1 className="text-2xl font-semibold">Criar atendimento</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Use os dados informados pela cliente. A mesma triagem e validação
          do portal da cliente será aplicada.
        </p>
      </header>
      <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        Este cadastro não cria uma conta para a cliente. Sem uma conta vinculada,
        ela não terá acesso direto a este atendimento no portal.
      </p>
      <ServiceRequestForm serverError={error} mode="concierge" />
    </div>
  );
}
