import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/services/auth/actions";

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
            className="text-lg font-semibold tracking-[0.18em] text-primary"
          >
            VERAH
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
