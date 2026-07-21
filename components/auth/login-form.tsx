import { signInWithEmail } from "@/services/auth/actions";
import { VerahLogo } from "@/components/brand/verah-logo";
import { VerahNetworkMotif } from "@/components/brand/verah-network-motif";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/primitives";

export function LoginForm({
  error,
  title = "Command Center",
  description = "Acesso administrativo autorizado.",
}: {
  error?: string;
  title?: string;
  description?: string;
}) {
  return (
    <Card className="w-full max-w-sm overflow-hidden">
      <CardHeader className="relative p-6">
        <VerahNetworkMotif className="absolute -right-16 -top-3 w-64 opacity-20" />
        <VerahLogo kind="wordmark" tone="light" size="md" priority className="relative mb-5" />
        <h1 className="relative text-xl font-semibold">{title}</h1>
        <p className="relative text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="p-6">
        <form action={signInWithEmail} className="space-y-3">
          <label className="block text-sm font-medium">
            E-mail
            <Input className="mt-1" name="email" type="email" autoComplete="email" required />
          </label>
          <label className="block text-sm font-medium">
            Senha
            <Input className="mt-1" name="password" type="password" autoComplete="current-password" required />
          </label>
          {error === "profile_missing" ? (
            <p role="alert" className="text-sm text-accent">
              Esta conta ainda não possui um perfil de acesso. Fale com o administrador.
            </p>
          ) : null}
          {error && error !== "profile_missing" ? (
            <p role="alert" className="text-sm text-accent">E-mail ou senha inválidos.</p>
          ) : null}
          <Button className="w-full" type="submit">Entrar</Button>
        </form>
      </CardContent>
    </Card>
  );
}
