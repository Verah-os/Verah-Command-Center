import Link from "next/link";
import { DemoShell } from "@/components/demo/demo-shell";
import { startSyntheticWhatsAppDemo } from "./actions";
import { SyntheticDemoSubmitButton } from "./submit-button";

export default async function SyntheticWhatsAppDemoPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <DemoShell showLogout={false}>
      <section className="mx-auto max-w-2xl px-5 py-12 sm:py-20">
        <div className="rounded-[2rem] border border-rose-100 bg-white p-6 shadow-[0_24px_80px_rgba(87,54,67,0.10)] sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">
            Pilot Alpha · modo seguro
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            WhatsApp → Concierge
          </h1>
          <p className="mt-4 leading-7 text-slate-600">
            Esta demonstração envia respostas fictícias pelo intake existente,
            cria um único atendimento com origem WhatsApp e abre a fila do
            Concierge para conferência.
          </p>
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
            Nenhuma mensagem é enviada à Meta e nenhum dado real é necessário.
            O acesso à fila continua protegido pelo login da equipe VERAH.
          </p>
          {error && (
            <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              {error === "unavailable"
                ? "A demonstração sintética não está habilitada neste ambiente."
                : "Não foi possível concluir a demonstração. Tente novamente."}
            </p>
          )}
          <form action={startSyntheticWhatsAppDemo} className="mt-7">
            <SyntheticDemoSubmitButton />
          </form>
          <Link
            href="/"
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-teal-200 px-5 text-sm font-semibold text-teal-800 outline-none hover:bg-teal-50 focus-visible:ring-4 focus-visible:ring-teal-100"
          >
            Voltar para a landing
          </Link>
        </div>
      </section>
    </DemoShell>
  );
}
