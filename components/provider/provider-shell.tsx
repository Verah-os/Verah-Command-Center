import Link from "next/link";
import { BriefcaseBusiness, LogOut } from "lucide-react";
import { signOut } from "@/services/auth/actions";
import { VerahLogo } from "@/components/brand/verah-logo";
import { PortalNavLink } from "@/components/brand/portal-nav-link";

export function ProviderShell({
  children,
  displayName,
}: {
  children: React.ReactNode;
  displayName: string;
}) {
  return (
    <div className="provider-surface min-h-screen text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-[var(--verah-sidebar)]/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <Link
            href="/demo/prestador"
            aria-label="VERAH — início do Portal do prestador"
            className="flex min-h-11 items-center gap-3 rounded-md outline-none focus-visible:ring-4 focus-visible:ring-[var(--focus)]"
          >
            <VerahLogo kind="symbol" tone="light" size="sm" priority alt="" className="sm:hidden" />
            <VerahLogo kind="wordmark" tone="light" size="sm" priority alt="" className="hidden sm:block" />
            <span>
              <span className="block text-sm font-semibold text-foreground sm:text-base">Portal do prestador</span>
            </span>
          </Link>
          <nav aria-label="Navegação do prestador" className="flex items-center gap-1 sm:gap-3">
            <PortalNavLink
              href="/demo/prestador"
              exact
              icon={<BriefcaseBusiness className="h-4 w-4" aria-hidden="true" />}
              className="hidden min-h-11 items-center gap-2 rounded-md px-3 text-sm font-semibold text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-4 focus-visible:ring-[var(--focus)] sm:flex"
              activeClassName="bg-primary/10 text-primary"
            >
              Atendimentos
            </PortalNavLink>
            <span className="hidden max-w-48 truncate text-sm text-muted-foreground lg:block">{displayName}</span>
            <form action={signOut}>
              <button
                className="flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-semibold text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-4 focus-visible:ring-[var(--focus)]"
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
