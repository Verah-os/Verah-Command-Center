import { completeCustomerOnboarding } from "@/services/auth/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/primitives";

export default async function CustomerOnboardingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="verah-surface flex min-h-screen items-center justify-center p-5">
    <Card className="w-full max-w-lg p-6 sm:p-8">
      <p className="text-sm font-semibold text-teal-700">Conta criada</p>
      <h1 className="mt-2 text-2xl font-semibold">Vamos preparar sua VERAH</h1>
      <p className="mt-2 text-sm text-muted-foreground">Este progresso fica salvo. WhatsApp é um canal opcional e nunca substitui sua identidade.</p>
      <form action={completeCustomerOnboarding} className="mt-6 space-y-5">
        <label className="block text-sm font-medium">Nome de preferência<Input className="mt-1" name="display_name" required /></label>
        <label className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" name="accept_terms" required /><span>Li e aceito os termos de onboarding do Pilot Alpha v1. Consentimentos de WhatsApp, transporte, orçamento e pagamento permanecem separados.</span></label>
        {error ? <p role="alert" className="text-sm text-accent">Confirme os dados e o aceite para continuar.</p> : null}
        <Button className="w-full" type="submit">Continuar para meu veículo</Button>
      </form>
    </Card>
  </main>;
}
