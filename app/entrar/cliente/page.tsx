import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";

export default async function CustomerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#fdecef_0%,#fff8f6_38%,#f2f8f7_100%)] p-5">
      <div className="w-full max-w-sm">
        <Link
          href="/demo"
          className="mb-5 inline-flex min-h-11 items-center text-sm font-semibold text-teal-800 outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
        >
          ← Voltar para a VERAH
        </Link>
        <LoginForm
          error={error}
          title="Que bom ter você aqui"
          description="Entre para iniciar ou acompanhar seus atendimentos com tranquilidade."
        />
        <p className="mt-5 text-center text-xs leading-5 text-slate-500">
          Seu acesso é protegido e seus atendimentos ficam visíveis somente para
          você.
        </p>
      </div>
    </main>
  );
}
