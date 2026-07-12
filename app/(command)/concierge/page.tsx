import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/services/supabase/server";
import { listConciergeServiceRequests } from "@/services/service-requests";

const filters = [
  ["todos", "Todos"], ["solicitado", "Solicitado"], ["concierge_aceitou", "Concierge aceitou"],
  ["urgentes", "Crítica/alta"], ["revisao", "Revisão humana"]
] as const;
const formatter = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

export default async function ConciergePage({ searchParams }: { searchParams: Promise<{ filter?: string; error?: string }> }) {
  const supabase = await createSupabaseServerClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect("/login");
  const { filter = "todos", error } = await searchParams; const requests = await listConciergeServiceRequests();
  const visible = requests.filter((request) => filter === "todos" || request.serviceStage === filter || (filter === "urgentes" && ["critica", "alta"].includes(request.perceivedUrgency)) || (filter === "revisao" && request.requiresHumanReview));
  return <div className="space-y-5"><header><p className="text-sm text-muted-foreground">Operação do Concierge</p><h1 className="text-2xl font-semibold">Atendimentos</h1><p className="mt-2 text-sm text-muted-foreground">Revise a triagem e assuma os casos que precisam de encaminhamento.</p></header>
    {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <nav className="flex flex-wrap gap-2">{filters.map(([value, label]) => <Link key={value} href={`/concierge?filter=${value}` as Route} className={`rounded-md border px-3 py-2 text-sm ${filter === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-white text-muted-foreground hover:bg-muted"}`}>{label}</Link>)}</nav>
    <div className="grid gap-3">{visible.length ? visible.map((request) => <Link key={request.id} href={`/concierge/${request.id}` as Route}><Card className="transition hover:border-primary/40 hover:shadow-sm"><CardContent className="grid gap-4 p-4 md:grid-cols-[1fr_1.2fr_0.8fr_0.8fr] md:items-center"><div><p className="font-mono text-sm font-semibold text-primary">{request.referenceCode}</p><p className="mt-1 font-medium">{request.customerName}</p><p className="text-xs text-muted-foreground">{formatter.format(new Date(request.createdAt))}</p></div><div><p className="font-medium">{request.vehicleBrand} {request.vehicleModel}{request.vehicleYear ? ` · ${request.vehicleYear}` : ""}</p><p className="text-sm text-muted-foreground">{request.city} · {(request.probableCategory ?? "outro").replaceAll("_", " ")}</p></div><div><Badge value={request.perceivedUrgency} urgent={["critica", "alta"].includes(request.perceivedUrgency)} /><p className="mt-2 text-xs text-muted-foreground">{request.requiresHumanReview ? "Revisão humana" : "Triagem revisada"}</p></div><div className="md:text-right"><Badge value={request.serviceStage.replaceAll("_", " ")} /><p className="mt-2 text-xs font-medium text-primary">Abrir detalhes →</p></div></CardContent></Card></Link>) : <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Nenhum atendimento corresponde a este filtro.</CardContent></Card>}</div>
  </div>;
}

function Badge({ value, urgent = false }: { value: string; urgent?: boolean }) { return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${urgent ? "bg-red-100 text-red-800" : "bg-muted text-foreground"}`}>{value}</span>; }
