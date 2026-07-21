import { LockKeyhole } from "lucide-react";
import { VerahLogo } from "@/components/brand/verah-logo";
import { VerahNetworkMotif } from "@/components/brand/verah-network-motif";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/primitives";
import { signInWithEmail } from "@/services/auth/actions";

export function ConciergeLoginForm({ error }: { error?: string }) {
  return (
    <Card className="relative w-full max-w-md overflow-hidden p-6 sm:p-9">
      <VerahNetworkMotif className="absolute -right-16 top-1 w-72 opacity-20" />
      <VerahLogo kind="wordmark" tone="light" size="md" priority className="relative" />
      <h1 className="relative mt-6 text-3xl font-semibold tracking-tight">Central Concierge</h1>
      <p className="relative mt-3 leading-6 text-muted-foreground">
        Entre para acolher, organizar e acompanhar cada jornada com cuidado.
      </p>
      <form action={signInWithEmail} className="relative mt-8 space-y-5">
        <label className="block text-sm font-semibold">
          E-mail
          <Input className="mt-2" name="email" type="email" autoComplete="email" required />
        </label>
        <label className="block text-sm font-semibold">
          Senha
          <Input className="mt-2" name="password" type="password" autoComplete="current-password" required />
        </label>
        {error && (
          <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-4 text-sm text-red-200">
            {error === "profile_missing"
              ? "Esta conta ainda não possui acesso ao Concierge. Fale com o administrador."
              : "Não foi possível entrar. Confira o e-mail e a senha."}
          </p>
        )}
        <Button className="min-h-12 w-full gap-2" type="submit">
          <LockKeyhole className="h-4 w-4" aria-hidden="true" /> Entrar na Central
        </Button>
      </form>
      <p className="relative mt-6 text-center text-xs leading-5 text-muted-foreground">
        Acesso protegido para a equipe de atendimento VERAH.
      </p>
    </Card>
  );
}
