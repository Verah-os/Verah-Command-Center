import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, Info, PlusCircle } from "lucide-react";
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
      <header className="rounded-[1.5rem] border border-rose-100 bg-white/95 p-5 shadow-[0_18px_45px_rgba(64,83,80,0.06)] sm:p-7">
        <Link
          href={"/concierge" as Route}
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-teal-800 outline-none hover:underline focus-visible:ring-4 focus-visible:ring-teal-100"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar aos atendimentos
        </Link>
        <p className="mt-5 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-teal-700">
          <PlusCircle className="h-4 w-4" aria-hidden="true" /> Criação operacional
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Criar atendimento</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
          Use os dados informados pela cliente. A mesma triagem e validação
          do portal da cliente será aplicada.
        </p>
      </header>
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>Este cadastro não cria uma conta para a cliente. Sem uma conta vinculada, ela não terá acesso direto a este atendimento no portal.</p>
      </div>
      <ServiceRequestForm serverError={error} mode="concierge" />
    </div>
  );
}
