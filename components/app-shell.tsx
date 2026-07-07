import Link from "next/link";
import type { Route } from "next";
import { modules } from "@/modules/registry";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-border bg-white lg:block">
        <div className="border-b border-border px-5 py-4">
          <p className="text-sm font-semibold text-primary">VERAH</p>
          <h1 className="text-lg font-semibold">Command Center</h1>
        </div>
        <nav className="space-y-1 p-3">
          {modules.map((module) => (
            <Link
              key={module.slug}
              href={`/${module.slug}` as Route}
              className="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {module.title}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-border bg-white/95 px-5 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Operating System</p>
              <p className="font-semibold">VERAH Command Center</p>
            </div>
            <div className="rounded-md border border-border px-3 py-1 text-sm text-muted-foreground">Online</div>
          </div>
        </header>
        <div className="p-5">{children}</div>
      </main>
    </div>
  );
}
