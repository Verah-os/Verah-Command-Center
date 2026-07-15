import Link from "next/link";
import { BriefcaseBusiness, LogOut, Wrench } from "lucide-react";
import { signOut } from "@/services/auth/actions";

export function ProviderShell({
  children,
  displayName,
}: {
  children: React.ReactNode;
  displayName: string;
}) {
  return (
    <div className="provider-surface min-h-screen text-foreground">
      <header className="sticky top-0 z-30 border-b border-rose-100/80 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <Link
            href="/demo/prestador"
            className="flex min-h-11 items-center gap-3 rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-700 text-white shadow-sm">
              <Wrench className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-teal-800">VERAH</span>
              <span className="block text-sm font-semibold text-slate-800 sm:text-base">Portal do prestador</span>
            </span>
          </Link>
          <nav aria-label="Navegação do prestador" className="flex items-center gap-1 sm:gap-3">
            <Link
              href="/demo/prestador"
              className="hidden min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-600 outline-none hover:bg-teal-50 hover:text-teal-800 focus-visible:ring-4 focus-visible:ring-teal-100 sm:flex"
            >
              <BriefcaseBusiness className="h-4 w-4" aria-hidden="true" /> Atendimentos
            </Link>
            <span className="hidden max-w-48 truncate text-sm text-slate-500 lg:block">{displayName}</span>
            <form action={signOut}>
              <button
                className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-600 outline-none hover:bg-rose-50 hover:text-rose-800 focus-visible:ring-4 focus-visible:ring-rose-100"
                aria-label="Sair do Portal do prestador"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Sair</span>
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
