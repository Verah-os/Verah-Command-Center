import Link from "next/link";
import type { ReactNode } from "react";

export function DemoShell({ children }: { children: ReactNode }) {
  return <main className="min-h-screen bg-[linear-gradient(180deg,#fff8f6_0%,#f8faf9_42%,#f3f8f7_100%)] text-slate-900">
    <header className="border-b border-rose-100/80 bg-white/80 backdrop-blur"><div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4"><Link href="/demo" className="text-lg font-semibold tracking-[0.18em] text-teal-800">VERAH</Link><Link href="/demo/cliente" className="text-sm font-medium text-slate-600 hover:text-teal-800">Meus atendimentos</Link></div></header>
    {children}
  </main>;
}
