import Link from "next/link";
import type { Route } from "next";
import { ProviderLoginForm } from "@/components/provider/provider-login-form";

export default async function ProviderLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="auth-surface provider-surface flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-5 inline-flex min-h-11 items-center text-sm font-semibold text-teal-800 outline-none focus-visible:ring-4 focus-visible:ring-teal-100">
          ← Voltar para a VERAH
        </Link>
        <ProviderLoginForm error={error} />
        <Link href={"/entrar/prestador/cadastro" as Route} className="mt-5 block text-center text-sm font-semibold text-teal-800">
          Candidatar minha oficina à Rede VERAH
        </Link>
      </div>
    </main>
  );
}
