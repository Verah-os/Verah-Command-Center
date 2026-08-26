"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CarFront,
  Check,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  LogOut,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UsersRound,
  WifiOff,
  Wrench,
} from "lucide-react";
import { customerPilotDemo as demo } from "@/lib/customer-pilot-demo";
import { customerStageLabels } from "@/lib/customer-service-stage";

const storageKey = "verah.customer-pilot-demo.v1";
const scenes = ["home", "intake", "tracking", "coordination", "quote", "payment", "execution", "completion", "passport", "next-care"] as const;
type Scene = (typeof scenes)[number];
type StoredState = { scene: Scene; furthest: number; approved: boolean; paid: boolean };

const sceneLabels: Record<Scene, string> = {
  home: "Meu veículo",
  intake: "Relato",
  tracking: "Acompanhamento",
  coordination: "Coordenação VERAH",
  quote: "Orçamento",
  payment: "Pagamento demo",
  execution: "Execução",
  completion: "Conclusão",
  passport: "Passaporte",
  "next-care": "Próximos Cuidados",
};

export function CustomerPilotDemo() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [online, setOnline] = useState(true);
  const [state, setState] = useState<StoredState>({ scene: "home", furthest: 0, approved: false, paid: false });

  useEffect(() => {
    setOnline(navigator.onLine);
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    const stored = readStoredState();
    if (stored) {
      setSignedIn(true);
      setState(stored);
    }
    setReady(true);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/customer-demo-sw.js", {
        scope: "/demo/cliente/piloto",
      });
    }
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    if (ready && signedIn) writeStoredState(state);
  }, [ready, signedIn, state]);

  if (!ready) return <DemoLoading />;
  if (!signedIn) return <DemoLogin online={online} onEnter={() => {
    const initial = { scene: "home" as const, furthest: 0, approved: false, paid: false };
    setState(initial);
    setSignedIn(true);
    writeStoredState(initial);
  }} />;

  const sceneIndex = scenes.indexOf(state.scene);
  const advance = (scene: Scene, patch: Partial<StoredState> = {}) => {
    if (!online) return;
    const index = scenes.indexOf(scene);
    setState((current) => ({ ...current, ...patch, scene, furthest: Math.max(current.furthest, index) }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const logout = () => {
    clearStoredState();
    setSignedIn(false);
    setState({ scene: "home", furthest: 0, approved: false, paid: false });
    navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_CUSTOMER_DEMO_CACHE" });
  };
  const reset = () => {
    const initial = { scene: "home" as const, furthest: 0, approved: false, paid: false };
    setState(initial);
    writeStoredState(initial);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-[#232323] text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#1A1A1A]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div>
            <p className="text-lg font-semibold tracking-[0.18em] text-[#E8B6C0]">VERAH</p>
            <p className="text-xs text-[#9A9A9A]">Experiência cliente · demo sintética</p>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={reset} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-white outline-none hover:bg-white/10 focus-visible:ring-4 focus-visible:ring-[#E8B6C0]/30">
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> Reiniciar
            </button>
            <button type="button" onClick={logout} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-white outline-none hover:bg-white/10 focus-visible:ring-4 focus-visible:ring-[#E8B6C0]/30">
              <LogOut className="h-4 w-4" aria-hidden="true" /> Sair
            </button>
          </div>
        </div>
      </header>

      <div aria-live="polite">
        {!online && <div className="border-b border-amber-400/30 bg-amber-400/10 px-4 py-3 text-center text-sm text-amber-100"><WifiOff className="mr-2 inline h-4 w-4" aria-hidden="true" />Sem conexão. Você pode consultar esta tela; aprovações ficam bloqueadas até reconectar.</div>}
      </div>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[15rem_1fr] lg:py-10">
        <aside className="hidden lg:block">
          <nav aria-label="Etapas da jornada" className="sticky top-28 space-y-1 rounded-[20px] border border-white/10 bg-[#2E2E2E] p-3">
            {scenes.map((scene, index) => <button key={scene} type="button" disabled={index > state.furthest} onClick={() => advance(scene)} className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm outline-none focus-visible:ring-4 focus-visible:ring-[#E8B6C0]/30 ${scene === state.scene ? "bg-[#E8B6C0] font-semibold text-[#232323]" : index <= state.furthest ? "text-white hover:bg-white/10" : "cursor-not-allowed text-[#666]"}`}><span className="flex h-6 w-6 items-center justify-center rounded-full border border-current text-xs">{index < sceneIndex ? "✓" : index + 1}</span>{sceneLabels[scene]}</button>)}
          </nav>
        </aside>

        <main>
          <DemoBadge />
          <SceneContent scene={state.scene} approved={state.approved} paid={state.paid} online={online} advance={advance} />
          <div className="mt-6 flex items-center justify-between gap-3 lg:hidden">
            <button type="button" disabled={sceneIndex === 0} onClick={() => advance(scenes[Math.max(0, sceneIndex - 1)])} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-semibold disabled:opacity-40"><ArrowLeft className="h-4 w-4" /> Voltar</button>
            <p className="text-xs text-[#9A9A9A]">{sceneIndex + 1} de {scenes.length}</p>
          </div>
        </main>
      </div>
    </div>
  );
}

function SceneContent({ scene, approved, paid, online, advance }: { scene: Scene; approved: boolean; paid: boolean; online: boolean; advance: (scene: Scene, patch?: Partial<StoredState>) => void }) {
  if (scene === "home") return <Scene icon={CarFront} eyebrow={`Olá, ${demo.customer.firstName}`} title="Seu carro, seus cuidados, tudo em um só lugar." action={<PrimaryAction online={online} onClick={() => advance("intake")}>Relatar um problema <ArrowRight className="h-4 w-4" /></PrimaryAction>}><div className="grid gap-4 sm:grid-cols-2"><Info label="Veículo" value={`${demo.vehicle.name} · ${demo.vehicle.year}`} /><Info label="Identificação" value={demo.vehicle.id} /><Info label="Quilometragem" value={`${demo.vehicle.mileageAtIntake.toLocaleString("pt-BR")} km`} /><Info label="Placa" value={demo.vehicle.plate} /></div><CareCard /></Scene>;
  if (scene === "intake") return <Scene icon={Sparkles} eyebrow="Novo atendimento" title="Conte do seu jeito. A VERAH organiza o próximo passo." action={<PrimaryAction online={online} onClick={() => advance("tracking")}>Acompanhar atendimento <ArrowRight className="h-4 w-4" /></PrimaryAction>}><Info label="Relato de Marina" value={demo.report} /><div className="rounded-[20px] border border-[#E8B6C0]/30 bg-[#E8B6C0]/10 p-5"><p className="font-semibold text-[#E8B6C0]">Vamos cuidar disso</p><p className="mt-2 leading-7 text-white/80">{demo.reassurance}</p></div><div className="grid gap-3 sm:grid-cols-2"><Info label="Categoria inicial" value={demo.triage.category} /><Info label="Prioridade" value={demo.triage.priority} /></div><p className="text-sm text-[#9A9A9A]">{demo.triage.disclaimer}</p></Scene>;
  if (scene === "tracking") return <Scene icon={Clock3} eyebrow="Acompanhamento" title="Você sabe o que está acontecendo e qual é o próximo passo." action={<PrimaryAction online={online} onClick={() => advance("coordination")}>Ver como a VERAH coordenou <ArrowRight className="h-4 w-4" /></PrimaryAction>}><CareCard /><Timeline limit={4} /></Scene>;
  if (scene === "coordination") return <Scene icon={UsersRound} eyebrow="Visão da coordenação" title="A VERAH compara opções e explica a recomendação — Marina decide." action={<PrimaryAction online={online} onClick={() => advance("quote")}>Voltar à decisão da Marina <ArrowRight className="h-4 w-4" /></PrimaryAction>}><div className="grid gap-3 sm:grid-cols-3">{demo.network.invitations.map((invitation) => <Info key={invitation.provider} label={invitation.status} value={`${invitation.provider}\n${invitation.context}`} />)}</div><div className="grid gap-4 sm:grid-cols-2">{demo.network.proposals.map((proposal) => <div key={proposal.provider} className="rounded-[20px] border border-white/10 bg-white/[0.03] p-5"><p className="text-xs font-semibold uppercase tracking-wider text-[#E8B6C0]">{proposal.highlight}</p><h2 className="mt-2 font-semibold">{proposal.provider}</h2><p className="mt-3 text-3xl font-semibold">{money(proposal.total)}</p><p className="mt-2 text-sm text-[#9A9A9A]">{proposal.duration} · {proposal.warranty}</p><p className="mt-4 text-sm leading-6 text-white/80">{proposal.qualityReason}</p></div>)}</div><div className="rounded-[20px] border border-[#E8B6C0]/30 bg-[#E8B6C0]/10 p-5"><p className="font-semibold text-[#E8B6C0]">Por que a proposta A?</p><p className="mt-2 leading-7 text-white/80">{demo.network.comparison.recommendation}</p><p className="mt-3 text-sm text-[#9A9A9A]">{demo.network.secondOpinion.summary}</p></div><p className="text-sm leading-6 text-[#9A9A9A]">Operação humana assistida por software · prestadores, avaliações e evidências são fixtures sintéticas.</p></Scene>;
  if (scene === "quote") return <Scene icon={FileCheck2} eyebrow="Sua decisão" title="Um orçamento simples, com tudo explicado antes de começar." action={<PrimaryAction online={online} onClick={() => advance("payment", { approved: true })}>Aprovar total demonstrativo de {money(demo.quote.total)} <Check className="h-4 w-4" /></PrimaryAction>}><p className="leading-7 text-white/80">{demo.quote.summary}</p><div className="space-y-3">{demo.quote.items.map((item) => <div key={item.label} className="flex justify-between gap-4 border-b border-white/10 pb-3 text-sm"><span>{item.label}</span><strong>{money(item.amount)}</strong></div>)}</div><div className="rounded-[20px] bg-white/5 p-5"><Price label="Serviço e especialista" value={demo.quote.serviceAmount} /><Price label="Taxa VERAH demo" value={demo.quote.verahFee} /><Price label="Total para você aprovar" value={demo.quote.total} total /></div><p className="text-sm leading-6 text-[#9A9A9A]">{demo.quote.rationale}</p><Info label="Prazo" value={demo.quote.duration} /><Info label="Garantia" value={demo.quote.warranty} /></Scene>;
  if (scene === "payment") return <Scene icon={CircleDollarSign} eyebrow="Pagamento demonstrativo" title={approved ? "Aprovação registrada. Agora veja como seria o pagamento." : "O orçamento precisa ser aprovado primeiro."} action={<PrimaryAction online={online && approved} onClick={() => advance("execution", { paid: true })}>Confirmar pagamento sandbox <ArrowRight className="h-4 w-4" /></PrimaryAction>}><div className="rounded-[20px] border border-amber-300/30 bg-amber-300/10 p-5"><p className="text-sm font-semibold uppercase tracking-wider text-amber-200">Sandbox / mock</p><p className="mt-3 text-2xl font-semibold">{money(demo.quote.total)}</p><p className="mt-2 text-white/80">{demo.payment.method}</p><p className="mt-4 text-sm leading-6 text-amber-100">{demo.payment.disclaimer}</p></div><p className="text-sm text-[#9A9A9A]">Composição conceitual: {money(demo.quote.serviceAmount)} para o serviço + {money(demo.quote.verahFee)} de taxa VERAH. Sem split ou cobrança real.</p></Scene>;
  if (scene === "execution") return <Scene icon={Wrench} eyebrow="Execução acompanhada" title={paid ? "O serviço está em andamento com a VERAH ao seu lado." : "Confirmação sandbox pendente."} action={<PrimaryAction online={online && paid} onClick={() => advance("completion")}>Ver conclusão <ArrowRight className="h-4 w-4" /></PrimaryAction>}><CareCard /><Timeline limit={10} /><p className="rounded-[20px] bg-emerald-400/10 p-5 text-sm leading-6 text-emerald-100">Nenhuma alteração de escopo ou valor acontece sem uma nova autorização explícita.</p></Scene>;
  if (scene === "completion") return <Scene icon={ShieldCheck} eyebrow="Tudo pronto" title="Atendimento concluído e conferido pela VERAH." action={<PrimaryAction online={online} onClick={() => advance("passport")}>Abrir Passaporte <ArrowRight className="h-4 w-4" /></PrimaryAction>}><Timeline /><Info label="Serviço registrado" value={demo.completion.service} /><Info label="Resultado" value={demo.completion.note} /><div className="grid gap-3 sm:grid-cols-2"><Info label="Valor final demonstrativo" value={money(demo.quote.total)} /><Info label="Quilometragem final" value={`${demo.vehicle.mileageAtCompletion.toLocaleString("pt-BR")} km`} /></div></Scene>;
  if (scene === "passport") return <Scene icon={FileCheck2} eyebrow="Passaporte VERAH" title="Este atendimento agora faz parte da história do seu carro." action={<PrimaryAction online={online} onClick={() => advance("next-care")}>Ver Próximos Cuidados <ArrowRight className="h-4 w-4" /></PrimaryAction>}><div className="rounded-[20px] border border-[#E8B6C0]/30 bg-[#E8B6C0]/10 p-5"><p className="font-semibold text-[#E8B6C0]">Evento registrado</p><p className="mt-3 leading-7 text-white/80">{demo.passport.event}</p></div><p className="text-sm text-[#9A9A9A]">Origem e documento são fixtures sintéticas; nenhum dado externo foi consultado.</p></Scene>;
  return <Scene icon={Sparkles} eyebrow="Próximos Cuidados" title="O cuidado continua depois da entrega."><div className="space-y-3">{demo.nextCare.map((care) => <div key={care} className="flex gap-3 rounded-[20px] bg-white/5 p-5"><Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" /><p className="leading-7 text-white/80">{care}</p></div>)}</div><p className="rounded-[20px] border border-white/10 p-5 text-sm leading-6 text-[#9A9A9A]">A VERAH não entrega apenas uma oficina. Coordena a decisão, acompanha a execução e transforma cada atendimento em conhecimento para cuidar melhor do veículo depois.</p></Scene>;
}

function Scene({ icon: Icon, eyebrow, title, children, action }: { icon: typeof CarFront; eyebrow: string; title: string; children: React.ReactNode; action?: React.ReactNode }) { return <section className="rounded-[20px] border border-white/10 bg-[#2E2E2E] p-5 shadow-2xl shadow-black/20 sm:p-8"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E8B6C0]/10 text-[#E8B6C0]"><Icon className="h-6 w-6" /></div><p className="mt-6 text-sm font-semibold uppercase tracking-[0.16em] text-[#E8B6C0]">{eyebrow}</p><h1 className="mt-2 max-w-2xl text-3xl font-semibold leading-tight sm:text-4xl">{title}</h1><div className="mt-7 space-y-5">{children}</div>{action && <div className="mt-8">{action}</div>}</section>; }
function DemoBadge() { return <p className="mb-3 inline-flex rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-100">Ambiente demonstrativo · dados 100% sintéticos</p>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-[16px] border border-white/10 bg-white/[0.03] p-4"><p className="text-xs font-semibold uppercase tracking-wider text-[#9A9A9A]">{label}</p><p className="mt-2 whitespace-pre-wrap leading-7 text-white/90">{value}</p></div>; }
function Price({ label, value, total = false }: { label: string; value: number; total?: boolean }) { return <div className={`flex items-center justify-between gap-4 py-2 ${total ? "mt-2 border-t border-white/10 pt-4 text-lg" : "text-sm"}`}><span>{label}</span><strong>{money(value)}</strong></div>; }
function CareCard() { return <div className="rounded-[20px] border border-emerald-300/20 bg-emerald-300/10 p-5"><p className="font-semibold text-emerald-200">{demo.transport.title}</p><p className="mt-2 text-sm leading-6 text-emerald-50/80">{demo.transport.description}</p></div>; }
function Timeline({ limit = demo.timeline.length }: { limit?: number }) { return <ol className="space-y-0">{demo.timeline.slice(0, limit).map((event, index) => <li key={`${event.time}-${event.label}`} className="relative flex gap-4 pb-6 last:pb-0"><span className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-400 text-xs font-bold text-[#232323]">✓</span>{index < Math.min(limit, demo.timeline.length) - 1 && <span className="absolute left-[13px] top-7 h-full w-px bg-white/15" />}<div><div className="flex flex-wrap items-baseline gap-2"><p className="font-semibold">{event.label}</p><time className="text-xs text-[#9A9A9A]">{event.time}</time></div><p className="mt-1 text-xs text-[#9A9A9A]">{customerStageLabels[event.stage]}</p></div></li>)}</ol>; }
function PrimaryAction({ online, onClick, children }: { online: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" disabled={!online} onClick={onClick} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-[#E8B6C0] px-5 text-sm font-semibold text-[#232323] outline-none transition hover:bg-[#f2ccd4] focus-visible:ring-4 focus-visible:ring-[#E8B6C0]/30 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto">{children}</button>; }
function DemoLoading() { return <div className="flex min-h-screen items-center justify-center bg-[#232323] px-6 text-center text-white"><p role="status" className="text-sm text-[#9A9A9A]">Preparando experiência demonstrativa…</p></div>; }
function DemoLogin({ online, onEnter }: { online: boolean; onEnter: () => void }) { return <main className="flex min-h-screen items-center justify-center bg-[#232323] px-4 py-10 text-white"><section className="w-full max-w-md rounded-[20px] border border-white/10 bg-[#2E2E2E] p-6 shadow-2xl sm:p-8"><p className="text-lg font-semibold tracking-[0.18em] text-[#E8B6C0]">VERAH</p><p className="mt-8 text-sm font-semibold uppercase tracking-[0.16em] text-[#E8B6C0]">Entrada segura da demo</p><h1 className="mt-2 text-3xl font-semibold">Conheça a jornada de Marina</h1><p className="mt-4 leading-7 text-white/70">Este acesso não usa conta, senha ou dados reais. A sessão fica somente nesta aba e pode ser encerrada a qualquer momento.</p><DemoBadge /><button type="button" disabled={!online} onClick={onEnter} className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-[16px] bg-[#E8B6C0] px-5 font-semibold text-[#232323] disabled:opacity-45">Entrar na demonstração</button>{!online && <p role="alert" className="mt-4 text-sm text-amber-200">Reconecte para iniciar uma nova sessão demonstrativa.</p>}</section></main>; }

function readStoredState(): StoredState | null {
  try {
    const value = sessionStorage.getItem(storageKey);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<StoredState>;
    if (!parsed.scene || !scenes.includes(parsed.scene) || typeof parsed.furthest !== "number" || typeof parsed.approved !== "boolean" || typeof parsed.paid !== "boolean") return null;
    return { scene: parsed.scene, furthest: Math.min(Math.max(0, parsed.furthest), scenes.length - 1), approved: parsed.approved, paid: parsed.paid };
  } catch {
    clearStoredState();
    return null;
  }
}

function writeStoredState(state: StoredState) {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // A demo continua funcional quando o navegador bloqueia armazenamento local.
  }
}

function clearStoredState() {
  try {
    sessionStorage.removeItem(storageKey);
  } catch {
    // Não há dado real ou credencial a recuperar; o estado React ainda é limpo.
  }
}

function money(value: number) { return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
