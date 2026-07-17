import { LockKeyhole } from "lucide-react";
import { VerahLogo } from "@/components/brand/verah-logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/primitives";
import { signInWithEmail } from "@/services/auth/actions";

export function ProviderLoginForm({ error }: { error?: string }) {
  return (
    <Card className="w-full p-6 sm:p-9">
      <VerahLogo variant="light" size="md" priority />
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Portal do prestador</h1>
      <p className="mt-3 leading-6 text-muted-foreground">
        Acesse seus atendimentos, prepare propostas e acompanhe os serviços em andamento.
      </p>
      <form action={signInWithEmail} className="mt-8 space-y-5">
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
              ? "Esta conta ainda não possui acesso ao Portal do prestador. Fale com o administrador."
              : "Não foi possível entrar. Confira o e-mail e a senha."}
          </p>
        )}
        <Button className="min-h-12 w-full gap-2" type="submit">
          <LockKeyhole className="h-4 w-4" aria-hidden="true" /> Entrar no portal
        </Button>
      </form>
    </Card>
  );
}
