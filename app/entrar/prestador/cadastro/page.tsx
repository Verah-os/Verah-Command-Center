import Link from "next/link";
import { signUpProviderApplicationWithEmail } from "@/services/auth/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/primitives";

export default async function ProviderSignupPage({ searchParams }: { searchParams: Promise<{ error?: string; resume?: string }> }) {
  const { error, resume } = await searchParams;
  return <main className="auth-surface flex min-h-screen items-center justify-center p-5">
    <Card className="w-full max-w-lg p-6 sm:p-8">
      <h1 className="text-2xl font-semibold">Candidatura à Rede VERAH</h1>
      <p className="mt-2 text-sm text-muted-foreground">Criar a conta inicia uma análise. Não autoriza sua oficina a receber atendimentos.</p>
      {resume ? <p className="mt-4 rounded-md bg-teal-950/30 p-3 text-sm">Complete os dados da oficina para retomar sua candidatura.</p> : null}
      <form action={signUpProviderApplicationWithEmail} className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium sm:col-span-2">Razão social<Input className="mt-1" name="legal_name" required /></label>
        <label className="block text-sm font-medium">Nome fantasia<Input className="mt-1" name="trade_name" /></label>
        <label className="block text-sm font-medium">Cidade<Input className="mt-1" name="city" required /></label>
        <label className="block text-sm font-medium">E-mail<Input className="mt-1" name="email" type="email" required /></label>
        <label className="block text-sm font-medium">Senha<Input className="mt-1" name="password" type="password" minLength={8} required /></label>
        {error ? <p role="alert" className="text-sm text-accent sm:col-span-2">Não foi possível iniciar a candidatura.</p> : null}
        <Button className="sm:col-span-2" type="submit">Enviar candidatura</Button>
      </form>
      <Link href="/entrar/prestador" className="mt-5 block text-center text-sm font-semibold text-teal-800">Voltar ao login</Link>
    </Card>
  </main>;
}
