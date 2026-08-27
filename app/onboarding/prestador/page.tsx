import Link from "next/link";
import { Card } from "@/components/ui/card";

export default function ProviderOnboardingPage() {
  return <main className="provider-surface flex min-h-screen items-center justify-center p-5">
    <Card className="w-full max-w-lg p-6 text-center sm:p-9">
      <p className="text-sm font-semibold text-teal-700">Candidatura recebida</p>
      <h1 className="mt-2 text-3xl font-semibold">Cadastro em análise</h1>
      <p className="mt-4 leading-7 text-muted-foreground">Sua conta técnica foi criada como candidata. A VERAH ainda precisa revisar documentos, escopo e operação antes de autorizar atendimentos reais.</p>
      <p className="mt-4 text-sm">Nenhuma conta ou agente pode aprovar a própria oficina.</p>
      <Link href="/entrar/prestador" className="mt-6 inline-block font-semibold text-teal-800">Voltar ao acesso</Link>
    </Card>
  </main>;
}
