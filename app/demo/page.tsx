import Link from "next/link";
import { DemoShell } from "@/components/demo/demo-shell";

const steps = [
  "Conte o que aconteceu",
  "Receba uma análise inicial",
  "Avalie o orçamento com clareza",
  "Acompanhe até a conclusão",
];
const benefits = [
  {
    title: "Clareza",
    text: "Informações organizadas para você decidir com tranquilidade.",
  },
  { title: "Segurança", text: "Nenhum serviço começa antes da sua aprovação." },
  {
    title: "Acompanhamento",
    text: "Cada etapa permanece visível do início ao fim.",
  },
];

export default function DemoPage() {
  return (
    <DemoShell showLogout={false}>
      <section className="mx-auto max-w-5xl overflow-hidden px-5 py-12 sm:py-20">
        <div className="relative overflow-hidden rounded-[2rem] border border-rose-100 bg-white px-6 py-12 shadow-[0_24px_80px_rgba(87,54,67,0.10)] sm:px-12 sm:py-16">
          <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-rose-100/70 blur-3xl" />
          <div className="relative max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-teal-700">
              Cuidado automotivo do seu jeito
            </p>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.08] tracking-tight text-slate-900 sm:text-6xl">
              Confiança para cuidar do que é seu.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
              A VERAH transforma dúvidas sobre o seu veículo em uma jornada
              clara, acompanhada e sem pressão.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/demo/cliente/novo-atendimento"
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-teal-700 px-6 font-semibold text-white shadow-sm outline-none hover:bg-teal-800 focus-visible:ring-4 focus-visible:ring-teal-200"
              >
                Iniciar atendimento
              </Link>
              <Link
                href="/entrar/cliente"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-teal-200 bg-white px-6 font-semibold text-teal-800 outline-none hover:bg-teal-50 focus-visible:ring-4 focus-visible:ring-teal-100"
              >
                Acessar meus atendimentos
              </Link>
            </div>
          </div>
        </div>
        <section className="mt-14" aria-labelledby="how-it-works">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-rose-600">
            Simples do começo ao fim
          </p>
          <h2
            id="how-it-works"
            className="mt-3 text-2xl font-semibold sm:text-3xl"
          >
            Como funciona
          </h2>
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <article
                key={step}
                className="rounded-2xl border border-rose-100 bg-white p-5 shadow-sm"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-100 text-sm font-bold text-rose-700">
                  {index + 1}
                </span>
                <h3 className="mt-4 font-semibold leading-6">{step}</h3>
              </article>
            ))}
          </div>
        </section>
        <section
          className="mt-14 grid gap-4 sm:grid-cols-3"
          aria-label="Benefícios"
        >
          {benefits.map((benefit) => (
            <article
              key={benefit.title}
              className="rounded-2xl bg-teal-800 p-6 text-white"
            >
              <h2 className="text-xl font-semibold">{benefit.title}</h2>
              <p className="mt-3 text-sm leading-6 text-teal-50">
                {benefit.text}
              </p>
            </article>
          ))}
        </section>
      </section>
    </DemoShell>
  );
}
