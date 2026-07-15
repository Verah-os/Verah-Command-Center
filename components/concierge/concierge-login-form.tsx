import { HeartHandshake, LockKeyhole } from "lucide-react";
import { signInWithEmail } from "@/services/auth/actions";

export function ConciergeLoginForm({ error }: { error?: string }) {
  return (
    <div className="w-full max-w-md rounded-[1.75rem] border border-rose-100 bg-white/95 p-6 shadow-[0_24px_70px_rgba(74,91,88,0.12)] sm:p-9">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-700 text-white">
        <HeartHandshake className="h-6 w-6" aria-hidden="true" />
      </div>
      <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-teal-800">VERAH</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Central Concierge</h1>
      <p className="mt-3 leading-6 text-slate-600">
        Entre para acolher, organizar e acompanhar cada atendimento com cuidado.
      </p>
      <form action={signInWithEmail} className="mt-8 space-y-5">
        <label className="block text-sm font-semibold text-slate-700">
          E-mail
          <input
            className="mt-2 h-12 w-full rounded-xl border border-rose-100 bg-white px-4 outline-none transition focus-visible:border-teal-600 focus-visible:ring-4 focus-visible:ring-teal-100"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </label>
        <label className="block text-sm font-semibold text-slate-700">
          Senha
          <input
            className="mt-2 h-12 w-full rounded-xl border border-rose-100 bg-white px-4 outline-none transition focus-visible:border-teal-600 focus-visible:ring-4 focus-visible:ring-teal-100"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        {error && (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            {error === "profile_missing"
              ? "Esta conta ainda não possui acesso ao Concierge. Fale com o administrador."
              : "Não foi possível entrar. Confira o e-mail e a senha."}
          </p>
        )}
        <button className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 font-semibold text-white shadow-sm outline-none transition hover:bg-teal-800 focus-visible:ring-4 focus-visible:ring-teal-200 disabled:cursor-not-allowed disabled:opacity-50">
          <LockKeyhole className="h-4 w-4" aria-hidden="true" />
          Entrar na Central
        </button>
      </form>
      <p className="mt-6 text-center text-xs leading-5 text-slate-500">
        Acesso protegido para a equipe de atendimento VERAH.
      </p>
    </div>
  );
}
