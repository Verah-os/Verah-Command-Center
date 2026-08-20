import Link from "next/link";
import type { Route } from "next";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Clock3,
  MessageCircleQuestion,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { DemoShell } from "@/components/demo/demo-shell";
import { DemoDecisionPanel } from "@/components/concierge/demo-decision-panel";
import {
  conciergeDemoFixture as fixture,
  conciergeDemoQueue,
  parseConciergeDemoState,
} from "@/lib/concierge-demo";

const journey = [
  "Intake revisado",
  "Prestadores convidados",
  "Propostas avaliadas",
  "Comparação pronta",
  "Decisão humana",
];

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export default async function ConciergeDemoPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const state = parseConciergeDemoState((await searchParams).state);

  return (
    <DemoShell showLogout={false}>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="rounded-[2rem] border border-rose-100 bg-white p-6 shadow-[0_24px_80px_rgba(87,54,67,0.09)] sm:p-9">
          <Link
            href="/demo"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-teal-800 outline-none hover:underline focus-visible:ring-4 focus-visible:ring-teal-100"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar às demonstrações
          </Link>
          <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-rose-600">
                Central Concierge · jornada sintética
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                Da dúvida à decisão, com clareza em cada etapa.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
                Veja como a VERAH organiza o relato da cliente, coordena oficinas e transforma propostas em uma escolha compreensível — sempre com revisão humana.
              </p>
            </div>
            <div className="rounded-2xl border border-teal-100 bg-teal-50 px-5 py-4 text-sm text-teal-950">
              <p className="font-semibold">Ambiente seguro para demonstração</p>
              <p className="mt-1">Dados fictícios · nenhuma mensagem ou decisão real</p>
            </div>
          </div>
        </header>

        {state === "error" ? (
          <DemoError />
        ) : state === "empty" ? (
          <DemoEmpty />
        ) : (
          <DemoJourney />
        )}

        <nav
          aria-label="Visualizar estados da demonstração"
          className="mt-8 flex flex-wrap items-center justify-center gap-2 text-sm"
        >
          <span className="mr-2 text-slate-500">Outros estados:</span>
          <StateLink href="/demo/concierge" active={state === "ready"}>Jornada completa</StateLink>
          <StateLink href="/demo/concierge?state=empty" active={state === "empty"}>Fila vazia</StateLink>
          <StateLink href="/demo/concierge?state=error" active={state === "error"}>Indisponibilidade</StateLink>
        </nav>
      </main>
    </DemoShell>
  );
}

function DemoJourney() {
  return (
    <>
      <section aria-labelledby="journey-title" className="mt-6 rounded-3xl border border-rose-100 bg-white p-5 sm:p-7">
        <h2 id="journey-title" className="sr-only">Progresso do atendimento</h2>
        <ol className="grid gap-3 sm:grid-cols-5">
          {journey.map((step, index) => (
            <li key={step} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 sm:block">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white">
                {index + 1}
              </span>
              <p className="text-sm font-semibold text-slate-700 sm:mt-3">{step}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
        <aside aria-labelledby="queue-title" className="rounded-3xl border border-rose-100 bg-white p-5 sm:p-6 lg:sticky lg:top-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">Fila</p>
              <h2 id="queue-title" className="mt-1 text-xl font-semibold text-slate-950">Atendimentos prioritários</h2>
            </div>
            <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">3 casos</span>
          </div>
          <div className="mt-5 space-y-3">
            {conciergeDemoQueue.map((item, index) => (
              <article
                key={item.reference}
                aria-current={index === 0 ? "true" : undefined}
                className={`rounded-2xl border p-4 ${index === 0 ? "border-teal-300 bg-teal-50/70 shadow-sm" : "border-slate-100 bg-slate-50/70"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold text-teal-800">{item.reference}</p>
                  <span className="text-xs font-semibold text-slate-500">{item.urgency}</span>
                </div>
                <h3 className="mt-2 font-semibold text-slate-900">{item.customer}</h3>
                <p className="mt-1 text-sm text-slate-600">{item.vehicle}</p>
                <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-700">
                  {index === 0 ? <CheckCircle2 className="h-4 w-4 text-teal-700" aria-hidden="true" /> : <Clock3 className="h-4 w-4 text-amber-600" aria-hidden="true" />}
                  {item.stage}
                </p>
              </article>
            ))}
          </div>
        </aside>

        <div className="space-y-6">
          <CaseHeader />
          <IntakeSection />
          <InvitationsSection />
          <ProposalsSection />
          <SecondOpinionSection />
          <DecisionSection />
          <DemoScript />
        </div>
      </div>
    </>
  );
}

function CaseHeader() {
  return (
    <section aria-labelledby="case-title" className="rounded-3xl bg-teal-900 p-6 text-white shadow-lg sm:p-8">
      <p className="text-sm font-semibold text-teal-100">{fixture.reference} · {fixture.city}</p>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="case-title" className="text-2xl font-semibold sm:text-3xl">{fixture.customer}</h2>
          <p className="mt-2 text-teal-50">{fixture.vehicle}</p>
        </div>
        <span className="w-fit rounded-full bg-rose-100 px-3 py-1.5 text-xs font-bold text-rose-800">Urgência {fixture.urgency.toLowerCase()}</span>
      </div>
      <div className="mt-6 rounded-2xl bg-white/10 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-teal-100">O que a cliente relatou</p>
        <p className="mt-2 leading-7 text-white">{fixture.reportedProblem}</p>
      </div>
    </section>
  );
}

function IntakeSection() {
  return (
    <Section eyebrow="1 · Contexto organizado" title="Intake pronto para revisão">
      <p className="leading-7 text-slate-700">{fixture.intake.summary}</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <InfoBox title="Sinais que pedem atenção" icon={<ShieldCheck className="h-5 w-5" aria-hidden="true" />}>
          <ul className="space-y-2 text-sm text-slate-700">
            {fixture.intake.riskSignals.map((signal) => <li key={signal}>• {signal}</li>)}
          </ul>
        </InfoBox>
        <InfoBox title="Próximo passo seguro" icon={<ArrowRight className="h-5 w-5" aria-hidden="true" />}>
          <p className="text-sm leading-6 text-slate-700">{fixture.intake.safeNextStep}</p>
        </InfoBox>
      </div>
    </Section>
  );
}

function InvitationsSection() {
  return (
    <Section eyebrow="2 · Rede coordenada" title="Prestadores convidados">
      <p className="text-sm leading-6 text-slate-600">O mesmo briefing mínimo foi compartilhado, sem expor contato da cliente. Cada oficina escolhe se pode atender.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {fixture.invitations.map((invitation) => (
          <article key={invitation.provider} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <UsersRound className="h-5 w-5 text-teal-700" aria-hidden="true" />
            <h3 className="mt-3 font-semibold text-slate-900">{invitation.provider}</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">{invitation.context}</p>
            <p className={`mt-4 text-sm font-semibold ${invitation.status === "Aceitou" ? "text-emerald-700" : invitation.status === "Recusou" ? "text-slate-500" : "text-amber-700"}`}>{invitation.status}</p>
          </article>
        ))}
      </div>
    </Section>
  );
}

function ProposalsSection() {
  return (
    <Section eyebrow="3 e 4 · Clareza comercial" title="Propostas avaliadas e comparadas">
      <p className="rounded-2xl border border-teal-100 bg-teal-50 p-4 text-sm leading-6 text-teal-950">{fixture.comparison.basis}</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {fixture.proposals.map((proposal) => (
          <article key={proposal.provider} className="rounded-2xl border border-rose-100 p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-rose-600">{proposal.highlight}</p>
            <h3 className="mt-2 text-lg font-semibold text-slate-950">{proposal.provider}</h3>
            <p className="mt-4 text-3xl font-semibold text-slate-950">{money.format(proposal.total)}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-slate-500">Prazo</dt><dd className="mt-1 font-semibold">{proposal.duration}</dd></div>
              <div><dt className="text-slate-500">Garantia</dt><dd className="mt-1 font-semibold">{proposal.warranty}</dd></div>
            </dl>
            <div className="mt-5 rounded-xl bg-slate-50 p-4">
              <p className="font-semibold text-teal-800">{proposal.qualityLabel}</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">{proposal.qualityReason}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <h3 className="font-semibold text-amber-950">Como explicar a diferença</h3>
        <p className="mt-2 text-sm leading-6 text-amber-950">{fixture.comparison.recommendation}</p>
        <p className="mt-3 text-xs leading-5 text-amber-900"><strong>Ressalva:</strong> {fixture.comparison.caveat}</p>
      </div>
    </Section>
  );
}

function SecondOpinionSection() {
  return (
    <Section eyebrow="Quando é necessário" title="Segunda opinião disponível">
      <div className="flex items-start gap-4 rounded-2xl border border-violet-100 bg-violet-50 p-5">
        <MessageCircleQuestion className="mt-1 h-6 w-6 shrink-0 text-violet-700" aria-hidden="true" />
        <div>
          <p className="font-semibold text-violet-950">{fixture.secondOpinion.label}</p>
          <p className="mt-2 text-sm leading-6 text-violet-950">{fixture.secondOpinion.summary}</p>
        </div>
      </div>
    </Section>
  );
}

function DecisionSection() {
  return (
    <Section eyebrow="5 · Responsabilidade explícita" title="A decisão continua humana">
      <DemoDecisionPanel prompt={fixture.decision.prompt} />
    </Section>
  );
}

function DemoScript() {
  const steps = [
    "Abra pela fila e destaque o caso prioritário de Marina.",
    "Mostre como o relato vira intake e orientação segura.",
    "Percorra convites, qualidade das propostas e comparação.",
    "Explique a segunda opinião e confirme uma decisão humana.",
  ];
  return (
    <details className="group rounded-3xl border border-slate-200 bg-slate-50 p-5 sm:p-6">
      <summary className="min-h-11 cursor-pointer list-none font-semibold text-slate-900 outline-none focus-visible:ring-4 focus-visible:ring-teal-100">
        Roteiro sugerido · 3 minutos
      </summary>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2">
        {steps.map((step, index) => <li key={step} className="rounded-xl bg-white p-4 text-sm leading-6 text-slate-700"><strong className="mr-2 text-teal-700">{index + 1}.</strong>{step}</li>)}
      </ol>
    </details>
  );
}

function DemoEmpty() {
  return (
    <section role="status" className="mt-6 rounded-3xl border border-rose-100 bg-white p-10 text-center sm:p-16">
      <CircleDot className="mx-auto h-10 w-10 text-rose-300" aria-hidden="true" />
      <h2 className="mt-5 text-2xl font-semibold text-slate-900">Fila em dia</h2>
      <p className="mx-auto mt-3 max-w-md leading-7 text-slate-600">Não há atendimentos aguardando análise. Novos casos aparecerão aqui assim que o intake estiver pronto.</p>
      <Link href="/demo/concierge" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-teal-700 px-5 text-sm font-semibold text-white outline-none hover:bg-teal-800 focus-visible:ring-4 focus-visible:ring-teal-200">Ver caso demonstrativo</Link>
    </section>
  );
}

function DemoError() {
  return (
    <section role="alert" className="mt-6 rounded-3xl border border-red-200 bg-red-50 p-8 sm:p-12">
      <h2 className="text-2xl font-semibold text-red-950">Não foi possível carregar a fila</h2>
      <p className="mt-3 max-w-xl leading-7 text-red-900">Os dados continuam protegidos. Tente novamente; nenhuma decisão ou atualização foi perdida.</p>
      <Link href="/demo/concierge" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-red-800 px-5 text-sm font-semibold text-white outline-none hover:bg-red-900 focus-visible:ring-4 focus-visible:ring-red-200">Tentar novamente</Link>
    </section>
  );
}

function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-rose-100 bg-white p-5 shadow-sm sm:p-7">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">{eyebrow}</p>
      <h2 className="mt-2 text-xl font-semibold text-slate-950 sm:text-2xl">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function InfoBox({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <div className="rounded-2xl bg-slate-50 p-4"><div className="flex items-center gap-2 font-semibold text-slate-900"><span className="text-teal-700">{icon}</span>{title}</div><div className="mt-3">{children}</div></div>;
}

function StateLink({ href, active, children }: { href: Route; active: boolean; children: React.ReactNode }) {
  return <Link href={href} aria-current={active ? "page" : undefined} className={`inline-flex min-h-10 items-center rounded-full border px-3 font-semibold outline-none focus-visible:ring-4 focus-visible:ring-teal-100 ${active ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-teal-200"}`}>{children}</Link>;
}
