"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";

type Decision = "approve" | "adjust";

const decisionCopy: Record<Decision, { title: string; confirmation: string }> = {
  approve: {
    title: "Aprovar proposta da Oficina Horizonte",
    confirmation:
      "Confirma que a cliente escolheu esta proposta após revisar valor, prazo e ressalvas?",
  },
  adjust: {
    title: "Solicitar ajuste nas propostas",
    confirmation:
      "Confirma que o Concierge deve pedir esclarecimentos antes de apresentar uma escolha à cliente?",
  },
};

export function DemoDecisionPanel({ prompt }: { prompt: string }) {
  const [pending, setPending] = useState<Decision | null>(null);
  const [confirmed, setConfirmed] = useState<Decision | null>(null);

  if (confirmed) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950"
      >
        <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
        <p className="mt-3 font-semibold">Decisão registrada na demonstração</p>
        <p className="mt-1 text-sm leading-6">
          {decisionCopy[confirmed].title}. Nenhum dado real foi alterado.
        </p>
        <button
          type="button"
          onClick={() => setConfirmed(null)}
          className="mt-4 min-h-11 rounded-xl border border-emerald-300 bg-white px-4 text-sm font-semibold outline-none hover:bg-emerald-100 focus-visible:ring-4 focus-visible:ring-emerald-200"
        >
          Voltar à decisão
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-slate-600">{prompt}</p>
      {pending ? (
        <div
          role="region"
          aria-live="polite"
          aria-labelledby="decision-confirmation-title"
          aria-describedby="decision-confirmation-description"
          className="rounded-2xl border border-amber-200 bg-amber-50 p-5"
        >
          <p id="decision-confirmation-title" className="font-semibold text-amber-950">
            Confirmar ação humana
          </p>
          <p
            id="decision-confirmation-description"
            className="mt-2 text-sm leading-6 text-amber-950"
          >
            {decisionCopy[pending].confirmation}
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setConfirmed(pending)}
              className="min-h-11 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white outline-none hover:bg-teal-800 focus-visible:ring-4 focus-visible:ring-teal-200"
            >
              Confirmar decisão
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              className="min-h-11 rounded-xl border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-950 outline-none hover:bg-amber-100 focus-visible:ring-4 focus-visible:ring-amber-200"
            >
              Voltar sem registrar
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setPending("approve")}
            className="min-h-12 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white outline-none hover:bg-teal-800 focus-visible:ring-4 focus-visible:ring-teal-200"
          >
            Registrar escolha da cliente
          </button>
          <button
            type="button"
            onClick={() => setPending("adjust")}
            className="min-h-12 rounded-xl border border-teal-200 bg-white px-4 text-sm font-semibold text-teal-800 outline-none hover:bg-teal-50 focus-visible:ring-4 focus-visible:ring-teal-100"
          >
            Pedir esclarecimentos
          </button>
        </div>
      )}
    </div>
  );
}
