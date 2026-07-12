import { signInWithEmail } from "@/services/auth/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function LoginForm({ error, title = "Command Center", description = "Acesso administrativo autorizado." }: { error?: string; title?: string; description?: string }) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <p className="text-sm font-semibold text-primary">VERAH</p>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent>
        <form action={signInWithEmail} className="space-y-3">
          <label className="block text-sm font-medium">
            Email
            <input
              className="mt-1 h-10 w-full rounded-md border border-border px-3"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </label>
          <label className="block text-sm font-medium">
            Senha
            <input
              className="mt-1 h-10 w-full rounded-md border border-border px-3"
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
