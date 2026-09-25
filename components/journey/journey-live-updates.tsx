"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getJourneyRevision } from "@/services/journey/live-actions";
import { createJourneyPoller, isJourneyPath } from "@/lib/journey-poller";

export function JourneyLiveUpdates() {
  const pathname = usePathname();
  const router = useRouter();
  const [status, setStatus] = useState("current");
  const [refreshing, startTransition] = useTransition();
  const refreshingRef = useRef(false);
  refreshingRef.current = refreshing;
  const retryRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!isJourneyPath(pathname)) return;
    let dirty = false;
    const editing = () => dirty || Boolean(document.activeElement?.closest("input,textarea,select,[contenteditable=true],form"));
    const changed = (event: Event) => {
      if (event.target instanceof Element && event.target.closest("form,input,textarea,select,[contenteditable=true]")) dirty = true;
    };
    // Stay conservative after submit: validation may fail and leave unsaved data.
    // Navigation or an explicit form reset starts a fresh editing lifecycle.
    const reset = () => { dirty = false; };
    const poller = createJourneyPoller({
      read: getJourneyRevision,
      active: () => !document.hidden && navigator.onLine && !refreshingRef.current,
      editing,
      refresh: () => startTransition(() => router.refresh()),
      sessionChanged: () => window.location.reload(),
      status: setStatus,
    });
    const tick = () => { void poller.tick(); };
    retryRef.current = tick;
    const offline = () => setStatus("unavailable");
    document.addEventListener("input", changed, true);
    document.addEventListener("change", changed, true);
    document.addEventListener("reset", reset, true);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("online", tick);
    window.addEventListener("offline", offline);
    window.addEventListener("focus", tick);
    const timer = window.setInterval(tick, 8000);
    tick();
    return () => {
      poller.stop();
      window.clearInterval(timer);
      document.removeEventListener("input", changed, true);
      document.removeEventListener("change", changed, true);
      document.removeEventListener("reset", reset, true);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("online", tick);
      window.removeEventListener("offline", offline);
      window.removeEventListener("focus", tick);
    };
  }, [pathname, router]);

  if (!isJourneyPath(pathname) || status === "current") return null;
  return <div role="status" className="fixed bottom-3 left-1/2 z-50 w-[min(90vw,36rem)] -translate-x-1/2 rounded-xl border bg-background p-3 text-sm text-foreground shadow-lg">
    {status === "pending" ? "Há atualizações no atendimento. Seus campos em edição foram preservados; salve a edição e reabra o atendimento para atualizar." : "Atualização automática indisponível. As informações exibidas podem estar desatualizadas."}
    {status === "unavailable" && <button type="button" className="ml-2 min-h-11 underline" onClick={() => retryRef.current()}>Tentar novamente</button>}
  </div>;
}
