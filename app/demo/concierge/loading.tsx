import { DemoShell } from "@/components/demo/demo-shell";

export default function ConciergeDemoLoading() {
  return (
    <DemoShell showLogout={false}>
      <main
        aria-busy="true"
        aria-label="Carregando demonstração do Concierge"
        className="mx-auto max-w-7xl animate-pulse px-4 py-8 sm:px-6 sm:py-12"
      >
        <div className="h-64 rounded-[2rem] bg-white" />
        <div className="mt-6 grid gap-6 lg:grid-cols-[0.72fr_1.28fr]">
          <div className="h-96 rounded-3xl bg-white" />
          <div className="space-y-6">
            <div className="h-72 rounded-3xl bg-teal-900/20" />
            <div className="h-80 rounded-3xl bg-white" />
          </div>
        </div>
        <p className="sr-only">Carregando fila e detalhes do atendimento.</p>
      </main>
    </DemoShell>
  );
}
