import Link from "next/link";
import type { ReactNode } from "react";
import { CarFront, FileClock, Home, Plus, ShieldCheck } from "lucide-react";
import { signOut } from "@/services/auth/actions";

const navigation = [
  { href: "/demo/cliente", label: "Início", icon: Home },
  { href: "/demo/cliente/veiculos", label: "Meus veículos", icon: CarFront },
  { href: "/demo/cliente/historico", label: "Histórico", icon: FileClock },
  { href: "/demo/cliente/garantias", label: "Garantias", icon: ShieldCheck },
  { href: "/demo/cliente/novo-atendimento", label: "Novo atendimento", icon: Plus },
] as const;

export function CustomerShell({ children }: { children: ReactNode }) {
  return (
    <div className="verah-surface min-h-screen text-foreground">
      <header className="border-b border-border bg-[var(--verah-sidebar)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-5 px-4 py-4 sm:px-6">
          <Link
            href="/demo/cliente"
            className="text-lg font-semibold tracking-[0.18em] text-primary outline-none focus-visible:ring-4 focus-visible:ring-[var(--focus)]"
          >
            VERAH
          </Link>
          <nav aria-label="Navegação da cliente" className="hidden items-center gap-1 lg:flex">
            {navigation.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground outline-none transition hover:bg-muted hover:text-foreground focus-visible:ring-4 focus-visible:ring-[var(--focus)]"
              >
                {label}
              </Link>
            ))}
          </nav>
          <form action={signOut}>
            <button className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-4 focus-visible:ring-[var(--focus)]">
              Sair
            </button>
          </form>
        </div>
        <nav
          aria-label="Navegação da cliente no celular"
          className="mx-auto grid max-w-2xl grid-cols-3 gap-1 border-t border-border px-3 py-2 lg:hidden"
        >
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-center text-xs font-semibold text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-4 focus-visible:ring-[var(--focus)]"
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
