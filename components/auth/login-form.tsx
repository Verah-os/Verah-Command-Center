import { signInWithEmail } from "@/services/auth/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function LoginForm({ error }: { error?: string }) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <p className="text-sm font-semibold text-primary">VERAH</p>
        <h1 className="text-xl font-semibold">Command Center</h1>
        <p className="text-sm text-muted-foreground">Acesso operacional autorizado.</p>
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
            Password
            <input
              className="mt-1 h-10 w-full rounded-md border border-border px-3"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {error ? <p className="text-sm text-accent">Credenciais invalidas.</p> : null}
          <Button className="w-full" type="submit">Entrar</Button>
        </form>
      </CardContent>
    </Card>
  );
}
