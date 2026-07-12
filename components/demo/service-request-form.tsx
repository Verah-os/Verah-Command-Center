"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { analyzeServiceRequest, type ServiceUrgency } from "@/services/service-copilot";
import { createServiceRequest } from "@/services/service-requests/actions";

type Values = { customerName: string; customerPhone: string; vehicleBrand: string; vehicleModel: string; vehicleYear: string; vehiclePlate: string; city: string; customerReport: string; perceivedUrgency: ServiceUrgency };
const initial: Values = { customerName: "", customerPhone: "", vehicleBrand: "", vehicleModel: "", vehicleYear: "", vehiclePlate: "", city: "", customerReport: "", perceivedUrgency: "media" };
const fieldClass = "mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-base outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100";

export function ServiceRequestForm() {
  const [values, setValues] = useState(initial); const [reviewing, setReviewing] = useState(false); const [error, setError] = useState("");
  const analysis = useMemo(() => reviewing ? analyzeServiceRequest({ customerReport: values.customerReport, vehicleBrand: values.vehicleBrand, vehicleModel: values.vehicleModel, vehicleYear: values.vehicleYear ? Number(values.vehicleYear) : null, city: values.city, perceivedUrgency: values.perceivedUrgency }) : null, [reviewing, values]);
  function update(name: keyof Values, value: string) { setValues((current) => ({ ...current, [name]: value })); setReviewing(false); }
  function review() { if (!values.customerName || !values.vehicleBrand || !values.vehicleModel || !values.city || values.customerReport.length < 15) { setError("Preencha os campos obrigatórios e descreva o problema com um pouco mais de detalhe."); return; } setError(""); setReviewing(true); }

  return <form action={createServiceRequest} className="space-y-6">
    {Object.entries(values).map(([name, value]) => <input key={`hidden-${name}`} type="hidden" name={name} value={value} />)}
    {!reviewing ? <Card className="shadow-sm"><CardContent className="grid gap-5 p-5 sm:grid-cols-2 sm:p-7">
      <Field label="Nome da cliente *" name="customerName" value={values.customerName} update={update} />
      <Field label="Telefone (opcional)" name="customerPhone" value={values.customerPhone} update={update} type="tel" />
      <Field label="Marca *" name="vehicleBrand" value={values.vehicleBrand} update={update} />
      <Field label="Modelo *" name="vehicleModel" value={values.vehicleModel} update={update} />
      <Field label="Ano (opcional)" name="vehicleYear" value={values.vehicleYear} update={update} type="number" />
      <Field label="Placa (opcional)" name="vehiclePlate" value={values.vehiclePlate} update={update} />
      <Field label="Cidade *" name="city" value={values.city} update={update} />
      <label className="text-sm font-medium text-slate-700">Urgência percebida *<select className={fieldClass} value={values.perceivedUrgency} onChange={(event) => update("perceivedUrgency", event.target.value)}><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></label>
      <label className="text-sm font-medium text-slate-700 sm:col-span-2">Conte o que aconteceu *<textarea className="mt-2 min-h-36 w-full rounded-lg border border-slate-200 bg-white p-3 text-base outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" value={values.customerReport} onChange={(event) => update("customerReport", event.target.value)} /></label>
      {error && <p className="sm:col-span-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      <Button type="button" className="h-12 w-full text-base sm:col-span-2" onClick={review}>Analisar com a VERAH</Button>
    </CardContent></Card> : analysis && <div className="space-y-5">
      <Card className="border-teal-100 shadow-sm"><CardContent className="space-y-5 p-5 sm:p-7"><div><p className="text-xs font-semibold uppercase tracking-wider text-teal-700">Análise inicial</p><h2 className="mt-2 text-xl font-semibold">Entendemos o seu relato</h2><p className="mt-2 text-slate-600">{analysis.summary}</p></div>
        <div className="grid gap-4 sm:grid-cols-3"><Info label="Categoria provável" value={analysis.probableCategory.replaceAll("_", " ")} /><Info label="Urgência" value={analysis.urgency} /><Info label="Confiança" value={`${Math.round(analysis.confidence * 100)}%`} /></div>
        <Info label="Próximo passo" value={analysis.recommendedNextStep} /><Info label="Mensagem da VERAH" value={analysis.customerMessage} />
        <List label="Sinais de risco" items={analysis.riskSignals} empty="Nenhum sinal específico identificado no relato." /><List label="Perguntas pendentes" items={analysis.missingQuestions} />
        <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">Esta é uma triagem inicial, não um diagnóstico mecânico. A análise exige revisão humana.</p>
      </CardContent></Card>
      <div className="grid gap-3 sm:grid-cols-2"><Button type="button" variant="secondary" className="h-12 text-base" onClick={() => setReviewing(false)}>Editar informações</Button><Button type="submit" className="h-12 text-base">Confirmar e criar atendimento</Button></div>
    </div>}
  </form>;
}

function Field({ label, name, value, update, type = "text" }: { label: string; name: keyof Values; value: string; update: (name: keyof Values, value: string) => void; type?: string }) { return <label className="text-sm font-medium text-slate-700">{label}<input className={fieldClass} type={type} value={value} onChange={(event) => update(name, event.target.value)} /></label>; }
function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 capitalize text-slate-800">{value}</p></div>; }
function List({ label, items, empty }: { label: string; items: string[]; empty?: string }) { return <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>{items.length ? <ul className="mt-2 space-y-1 text-sm text-slate-700">{items.map((item) => <li key={item}>• {item}</li>)}</ul> : <p className="mt-2 text-sm text-slate-600">{empty}</p>}</div>; }
