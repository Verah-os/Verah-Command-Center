import { signInWithEmail } from "@/services/auth/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/primitives";
import { VerahLogo } from "@/components/brand/verah-logo";

export function LoginForm({ error, title = "Command Center", description = "Acesso administrativo autorizado." }: { error?: string; title?: string; description?: string }) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <VerahLogo variant="light" size="md" priority className="mb-2" />
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent>
        <form action={signInWithEmail} className="space-y-3">
          <label className="block text-sm font-medium">
            Email
            <Input
              className="mt-1"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </label>
          <label className="block text-sm font-medium">
            Senha
            <Input
              className="mt-1"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {error === "profile_missing" ? <p className="text-sm text-accent">Esta conta ainda não possui um perfil de acesso. Fale com o administrador.</p> : null}
          {error && error !== "profile_missing" ? <p className="text-sm text-accent">E-mail ou senha inválidos.</p> : null}
          <Button className="w-full" type="submit">Entrar</Button>
        </form>
      </CardContent>
    </Card>
  );
}
