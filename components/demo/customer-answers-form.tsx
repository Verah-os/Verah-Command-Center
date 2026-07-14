"use client";

import { useState } from "react";
import { submitServiceRequestAnswers } from "@/services/service-requests/actions";

export function CustomerAnswersForm({
  requestId,
  questions,
  answers,
  submittedAt,
  answersSaved,
  answersError,
  locked,
}: {
  requestId: string;
  questions: string[];
  answers: Record<string, string>;
  submittedAt: string | null;
  answersSaved?: string;
  answersError?: string;
  locked: boolean;
}) {
  const answeredCount = questions.filter(
    (question) => Boolean(answers[question]?.trim()),
  ).length;
  const hasAnswers = answeredCount > 0;
  const allAnswered = answeredCount === questions.length;
  const [editing, setEditing] = useState(!allAnswered);
  const showForm = editing || !allAnswered;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">
          {allAnswered
            ? "Informações complementares enviadas"
            : "Complete as informações"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {allAnswered
            ? "Todas as informações solicitadas foram recebidas pela VERAH."
            : "Suas respostas ajudam a VERAH a encaminhar o atendimento com mais precisão."}
        </p>
      </div>
      {answersSaved && (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          Respostas salvas com sucesso.
        </p>
      )}
      {answersError && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-900"
        >
          {answersError}
        </p>
      )}
      {allAnswered && !showForm && (
        <dl className="space-y-3">
          {questions.map((question) => (
            <div key={question} className="rounded-xl bg-emerald-50 p-3">
              <dt className="text-sm font-semibold text-slate-800">
                {question}
              </dt>
              <dd className="mt-1 text-sm text-slate-600">
                {answers[question]}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {!locked && allAnswered && !showForm && (
        <button
          type="button"
          className="min-h-12 w-full rounded-xl border border-teal-700 px-5 font-semibold text-teal-800"
          onClick={() => setEditing(true)}
        >
          Editar respostas
        </button>
      )}
      {showForm && (
        <form action={submitServiceRequestAnswers} className="space-y-4">
          <input type="hidden" name="serviceRequestId" value={requestId} />
          {questions.map((question, index) => {
            const answered = Boolean(answers[question]?.trim());
            return (
              <label
                key={question}
                htmlFor={`answer-${index}`}
                className="block text-sm font-semibold text-slate-800"
              >
                {question}
                {!answered && hasAnswers && (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-900">
                    Ainda sem resposta
                  </span>
                )}
                <textarea
                  id={`answer-${index}`}
                  name={`answer:${question}`}
                  defaultValue={answers[question] ?? ""}
                  className={`mt-2 min-h-24 w-full rounded-xl border p-3 font-normal outline-none focus-visible:border-teal-600 focus-visible:ring-4 focus-visible:ring-teal-100 ${!answered && hasAnswers ? "border-amber-300 bg-amber-50/40" : "border-rose-100"}`}
                  disabled={locked}
                />
              </label>
            );
          })}
          {!locked && (
            <button className="min-h-12 w-full rounded-xl bg-teal-700 px-5 font-semibold text-white">
              {hasAnswers ? "Salvar alterações" : "Enviar respostas"}
            </button>
          )}
        </form>
      )}
      {submittedAt && (
        <p className="text-xs text-slate-500">
          Última atualização: {formatDate(submittedAt)}
        </p>
      )}
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
