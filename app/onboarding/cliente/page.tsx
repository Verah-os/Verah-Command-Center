import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { completeCustomerOnboarding } from "@/services/auth/actions";
import {
  confirmCustomerVehicleOnboarding,
  lookupCustomerVehicleForOnboarding,
} from "@/services/customer-vehicles/actions";
import { listCustomerVehicles } from "@/services/customer-vehicles/customer-vehicles-service";
import { createSupabaseServerClient } from "@/services/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/primitives";

type Params = {
  error?: string;
  mode?: "manual" | "suggested";
  plate?: string;
  brand?: string;
  model?: string;
  year?: string;
  version?: string;
  engine?: string;
  transmission?: string;
  saved?: string;
};

export default async function CustomerOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/entrar/cliente");
  const { data } = await supabase.rpc("refresh_customer_onboarding");
  const onboarding = data as {
    basic_profile_completed?: boolean;
    vehicle_status?: string;
  } | null;

  if (!onboarding?.basic_profile_completed) {
    return <Shell eyebrow="Conta criada" title="Vamos preparar sua VERAH">
      <p className="text-sm text-muted-foreground">Este progresso fica salvo. WhatsApp é um canal opcional e nunca substitui sua identidade.</p>
      <form action={completeCustomerOnboarding} className="mt-6 space-y-5">
        <label className="block text-sm font-medium">Nome de preferência<Input className="mt-1" name="display_name" required /></label>
        <label className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" name="accept_terms" required /><span>Li e aceito os termos de onboarding do Pilot Alpha v1. Consentimentos de WhatsApp, transporte, orçamento e pagamento permanecem separados.</span></label>
        {params.error ? <ErrorMessage /> : null}
        <Button className="w-full" type="submit">Continuar para meu veículo</Button>
      </form>
    </Shell>;
  }

  if (onboarding.vehicle_status === "registered" || params.saved === "1") {
    const vehicles = await listCustomerVehicles();
    const vehicle = vehicles.at(-1);
    return <Shell eyebrow="Veículo confirmado" title="Sua VERAH está pronta">
      <p className="text-sm text-muted-foreground">
        {vehicle ? `${vehicle.brand} ${vehicle.model}${vehicle.plate ? ` · ${vehicle.plate}` : ""}` : "Seu veículo canônico foi salvo."}
        {" "}Atendimentos, Concierge, custódia e histórico usarão este mesmo veículo.
      </p>
      <Link className="mt-6 flex min-h-11 items-center justify-center rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white" href="/demo/cliente">
        Continuar na VERAH
      </Link>
    </Shell>;
  }

  if (!params.mode || !params.plate) {
    return <Shell eyebrow="Seu primeiro veículo" title="Qual é a placa do seu carro?">
      <p className="text-sm text-muted-foreground">Usamos a placa apenas para localizar dados. Ela não substitui o identificador interno do veículo.</p>
      <form action={lookupCustomerVehicleForOnboarding} className="mt-6 space-y-4">
        <label className="block text-sm font-medium">Placa<Input className="mt-1 uppercase" name="plate" placeholder="ABC1234 ou ABC1D23" autoComplete="off" required /></label>
        {params.error ? <ErrorMessage /> : null}
        <Button className="w-full" type="submit">Continuar</Button>
      </form>
    </Shell>;
  }

  const suggested = params.mode === "suggested";
  return <Shell
    eyebrow={suggested ? "Sugestão local sintética" : "Cadastro manual"}
    title="Confirme os dados do veículo"
  >
    <p className="text-sm text-muted-foreground">
      {suggested
        ? "Estes dados vieram de uma fixture local de demonstração, não de uma consulta oficial."
        : "Nenhuma consulta externa foi feita. Informe somente o que souber; versão e motorização são opcionais."}
    </p>
    <form action={confirmCustomerVehicleOnboarding} className="mt-6 space-y-4">
      <input type="hidden" name="mode" value={params.mode} />
      <label className="block text-sm font-medium">Placa<Input className="mt-1 uppercase" name="plate" value={params.plate} readOnly /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">Marca<Input className="mt-1" name="brand" defaultValue={params.brand} readOnly={suggested} required /></label>
        <label className="block text-sm font-medium">Modelo<Input className="mt-1" name="model" defaultValue={params.model} readOnly={suggested} required /></label>
        <label className="block text-sm font-medium">Ano/modelo<Input className="mt-1" name="model_year" inputMode="numeric" defaultValue={params.year} readOnly={suggested} required /></label>
        <label className="block text-sm font-medium">Versão <span className="font-normal text-muted-foreground">(opcional)</span><Input className="mt-1" name="version" defaultValue={params.version} readOnly={suggested} /></label>
        <label className="block text-sm font-medium">Motorização <span className="font-normal text-muted-foreground">(opcional)</span><Input className="mt-1" name="engine_type" defaultValue={params.engine} readOnly={suggested} /></label>
        <label className="block text-sm font-medium">Câmbio <span className="font-normal text-muted-foreground">(opcional)</span><Input className="mt-1" name="transmission" defaultValue={params.transmission} readOnly={suggested} /></label>
      </div>
      <label className="flex items-start gap-3 rounded-xl border p-3 text-sm"><input className="mt-1" type="checkbox" name="customer_confirmed" required /><span>Confirmo que estes dados correspondem ao meu veículo.</span></label>
      {params.error ? <ErrorMessage /> : null}
      <Button className="w-full" type="submit">Salvar e continuar</Button>
    </form>
  </Shell>;
}

function Shell({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return <main className="verah-surface flex min-h-screen items-center justify-center p-4 sm:p-6">
    <Card className="w-full max-w-xl p-5 sm:p-8">
      <p className="text-sm font-semibold text-teal-700">{eyebrow}</p>
      <h1 className="mt-2 text-2xl font-semibold">{title}</h1>
      <div className="mt-2">{children}</div>
    </Card>
  </main>;
}

function ErrorMessage() {
  return <p role="alert" className="text-sm text-accent">Revise os dados e confirme para continuar.</p>;
}
