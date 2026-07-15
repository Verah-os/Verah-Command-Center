import Link from "next/link";
import type { Route } from "next";
import { ClipboardList, HeartHandshake, LogOut, Menu, Plus } from "lucide-react";
import { signOut } from "@/services/auth/actions";

export function ConciergeShell({
  children,
  displayName,
}: {
  children: React.ReactNode;
  displayName: string;
}) {
  return (
    <div className="concierge-surface min-h-screen text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-rose-100/80 bg-white/92 px-5 py-6 backdrop-blur lg:flex lg:flex-col">
        <Brand />
        <nav aria-label="Navegação do Concierge" className="mt-10 space-y-2">
          <NavLink href="/concierge" icon={<ClipboardList className="h-4 w-4" />}>
            Atendimentos
          </NavLink>
          <NavLink href="/concierge/novo-atendimento" icon={<Plus className="h-4 w-4" />}>
            Novo atendimento
          </NavLink>
        </nav>
        <div className="mt-auto rounded-2xl bg-rose-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-700">
            Concierge responsável
          </p>
          <p className="mt-2 truncate font-semibold text-slate-800">{displayName}</p>
        </div>
        <form action={signOut} className="mt-3">
          <button className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-600 outline-none transition hover:bg-slate-100 focus-visible:ring-4 focus-visible:ring-teal-100">
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sair
          </button>
        </form>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-rose-100/80 bg-white/90 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <div className="lg:hidden"><Brand compact /></div>
            <div className="hidden lg:block">
              <p className="text-xs font-medium text-muted-foreground">Central Concierge</p>
              <p className="font-semibold text-slate-800">Olá, {displayName}</p>
            </div>
            <details className="relative lg:hidden">
              <summary
                className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-xl border border-rose-100 bg-white text-teal-800 outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
                aria-label="Abrir menu"
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
              </summary>
              <div className="absolute right-0 top-14 w-64 rounded-2xl border border-rose-100 bg-white p-3 shadow-xl">
                <p className="px-3 pb-2 text-xs text-muted-foreground">{displayName}</p>
                <NavLink href="/concierge" icon={<ClipboardList className="h-4 w-4" />}>
                  Atendimentos
                </NavLink>
                <NavLink href="/concierge/novo-atendimento" icon={<Plus className="h-4 w-4" />}>
                  Novo atendimento
                </NavLink>
                <form action={signOut} className="mt-1">
                  <button className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100">
                    <LogOut className="h-4 w-4" aria-hidden="true" /> Sair
                  </button>
                </form>
              </div>
            </details>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`${compact ? "h-9 w-9" : "h-11 w-11"} flex items-center justify-center rounded-2xl bg-teal-700 text-white shadow-sm`}>
        <HeartHandshake className="h-5 w-5" aria-hidden="true" />
      </span>
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-800">VERAH</p>
        <p className={`${compact ? "text-sm" : "text-lg"} font-semibold text-slate-800`}>Central Concierge</p>
      </div>
    </div>
  );
}

function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href as Route}
      className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-700 outline-none transition hover:bg-rose-50 hover:text-teal-900 focus-visible:ring-4 focus-visible:ring-teal-100"
    >
      {icon}
      {children}
    </Link>
  );
}
