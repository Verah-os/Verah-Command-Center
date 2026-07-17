import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/services/auth/actions";
import { VerahLogo } from "@/components/brand/verah-logo";

export function DemoShell({
  children,
  showLogout = true,
}: {
  children: ReactNode;
  showLogout?: boolean;
}) {
  return (
    <main className="verah-surface min-h-screen text-foreground">
      <header className="border-b border-border bg-[var(--verah-sidebar)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link
            href="/demo"
            className="rounded-sm outline-none focus-visible:ring-4 focus-visible:ring-[var(--focus)]"
          >
            <VerahLogo variant="light" size="sm" priority />
          </Link>
          {showLogout && (
            <form action={signOut}>
              <button className="text-sm font-medium text-muted-foreground hover:text-foreground">
                Sair
              </button>
            </form>
          )}
        </div>
      </header>
      {children}
    </main>
  );
}
