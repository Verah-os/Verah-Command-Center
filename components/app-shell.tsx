import Link from "next/link";
import type { Route } from "next";
import { modules } from "@/modules/registry";
import { requireRole } from "@/services/auth/profile";
import { signOut } from "@/services/auth/actions";
import { ConciergeShell } from "@/components/concierge/concierge-shell";

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
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-border bg-card lg:block">
        <div className="border-b border-border px-5 py-4">
          <p className="text-sm font-semibold text-primary">VERAH</p>
          <h1 className="text-lg font-semibold">Command Center</h1>
        </div>
        <nav className="space-y-1 p-3">
          {visibleModules.map((module) => (
            <Link
              key={module.slug}
              href={`/${module.slug}` as Route}
              className="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {module.title}
            </Link>
          ))}
          <form action={signOut} className="pt-3">
            <button className="w-full rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
              Sair
            </button>
          </form>
        </nav>
      </aside>
      <main className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-border bg-card/95 px-5 py-3">
          <div className="flex items-center justify-between">
            <div>
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
                <button className="rounded-md border border-border px-3 py-1 text-sm text-muted-foreground">
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
