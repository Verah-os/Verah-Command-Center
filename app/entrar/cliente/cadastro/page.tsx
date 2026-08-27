import Link from "next/link";
import { signUpCustomerWithEmail } from "@/services/auth/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/primitives";

export default async function CustomerSignupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="auth-surface flex min-h-screen items-center justify-center p-5">
    <Card className="w-full max-w-md p-6 sm:p-8">
      <h1 className="text-2xl font-semibold">Crie sua conta VERAH</h1>
      <p className="mt-2 text-sm text-muted-foreground">Seu login dá acesso à mesma identidade, veículo e histórico da VERAH.</p>
      <form action={signUpCustomerWithEmail} className="mt-6 space-y-4">
        <label className="block text-sm font-medium">Como devemos chamar você?<Input className="mt-1" name="display_name" required /></label>
        <label className="block text-sm font-medium">E-mail<Input className="mt-1" name="email" type="email" autoComplete="email" required /></label>
        <label className="block text-sm font-medium">Senha<Input className="mt-1" name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
        {error ? <p role="alert" className="text-sm text-accent">Não foi possível criar a conta. Revise os dados e tente novamente.</p> : null}
        <Button className="w-full" type="submit">Criar conta</Button>
      </form>
      <Link href="/entrar/cliente" className="mt-5 block text-center text-sm font-semibold text-teal-800">Já tenho uma conta</Link>
    </Card>
  </main>;
}
