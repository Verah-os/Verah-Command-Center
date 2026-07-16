import Link from "next/link";
import { ConciergeLoginForm } from "@/components/concierge/concierge-login-form";

export default async function ConciergeLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="auth-surface concierge-surface flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-5 inline-flex min-h-11 items-center text-sm font-semibold text-teal-800 outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
        >
          ← Voltar para a VERAH
        </Link>
        <ConciergeLoginForm error={error} />
      </div>
    </main>
  );
}
