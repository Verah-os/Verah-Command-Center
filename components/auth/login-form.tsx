import { signInWithEmail } from "@/services/auth/actions";
import { LoginSubmitButton } from "@/components/auth/login-submit-button";
import { VerahLogo } from "@/components/brand/verah-logo";
import { VerahNetworkMotif } from "@/components/brand/verah-network-motif";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/primitives";

const errorMessages: Record<string, string> = {
  invalid_credentials: "E-mail ou senha inválidos.",
  profile_missing:
    "Esta conta ainda não possui um perfil de acesso. Fale com o administrador.",
  profile_invalid:
    "O perfil desta conta está inconsistente. Fale com o administrador.",
  profile_error: "Não foi possível validar seu acesso. Tente novamente.",
  session_required: "Sua sessão expirou. Entre novamente.",
  confirm_email: "Confirme o e-mail enviado e depois entre para continuar.",
};

export function LoginForm({
  error,
  title = "Command Center",
  description = "Acesso administrativo autorizado.",
  audience = "internal",
}: {
  error?: string;
  title?: string;
  description?: string;
  audience?: "customer" | "internal";
}) {
  const errorMessage = error
    ? (errorMessages[error] ?? "Não foi possível concluir o acesso.")
    : null;

  return (
    <Card className="w-full max-w-sm overflow-hidden">
      <CardHeader className="relative p-6">
        <VerahNetworkMotif className="absolute -right-16 -top-3 w-64 opacity-20" />
        <VerahLogo
          kind="wordmark"
          tone="light"
          size="md"
          priority
          className="relative mb-5"
        />
        <h1 className="relative text-xl font-semibold">{title}</h1>
        <p className="relative text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="p-6">
        <form action={signInWithEmail} className="space-y-3">
          <input type="hidden" name="audience" value={audience} />
          <label className="block text-sm font-medium">
            E-mail
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
          {errorMessage ? (
            <p role="alert" className="text-sm text-accent">
              {errorMessage}
            </p>
          ) : null}
          <LoginSubmitButton />
        </form>
      </CardContent>
    </Card>
  );
}
