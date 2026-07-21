import Link from "next/link";
import type { Route } from "next";
import { LogOut } from "lucide-react";
import { modules } from "@/modules/registry";
import { requireRole } from "@/services/auth/profile";
import { signOut } from "@/services/auth/actions";
import { ConciergeShell } from "@/components/concierge/concierge-shell";
import { VerahLogo } from "@/components/brand/verah-logo";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(["concierge", "admin"]);
  if (profile.role === "concierge") {
    return (
      <ConciergeShell displayName={profile.displayName}>{children}</ConciergeShell>
    );
  }
  const visibleModules =
    modules;
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-border bg-card lg:flex">
        <div className="border-b border-border px-5 py-4">
          <VerahLogo kind="wordmark" tone="light" size="sm" priority />
          <h1 className="mt-2 text-lg font-semibold">Command Center</h1>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {visibleModules.map((module) => (
            <Link
              key={module.slug}
              href={`/${module.slug}` as Route}
              className="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {module.title}
            </Link>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <p className="truncate px-3 pb-2 text-xs text-muted-foreground">
            {profile.displayName}
          </p>
          <form action={signOut}>
            <button className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-semibold text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-4 focus-visible:ring-[var(--focus)]">
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sair
            </button>
          </form>
        </div>
      </aside>
      <main className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-border bg-card/95 px-5 py-3">
          <div className="flex items-center justify-between">
            <VerahLogo kind="symbol" tone="light" size="sm" priority className="lg:hidden" />
            <div className="hidden lg:block">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Operating System
              </p>
              <p className="font-semibold">VERAH Command Center</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {profile.displayName}
              </span>
              <form action={signOut} className="lg:hidden">
                <button className="flex min-h-11 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-4 focus-visible:ring-[var(--focus)]">
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Sair
                </button>
              </form>
            </div>
          </div>
        </header>
        <div className="p-5">{children}</div>
      </main>
    </div>
  );
}
