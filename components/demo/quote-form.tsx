"use client";

import { Plus, Save, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { saveQuote } from "@/services/service-quotes/actions";
import type { ServiceQuote } from "@/types/service-quote";

type Item = {
  item_type: string;
  description: string;
  quantity: number;
  unit_price: number;
  is_optional: boolean;
};

const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const empty = (type = "part"): Item => ({
  item_type: type,
  description: "",
  quantity: 1,
  unit_price: 0,
  is_optional: false,
});

const inputClass =
  "mt-2 h-11 w-full rounded-xl border border-rose-100 bg-white px-3 text-sm outline-none focus-visible:border-teal-500 focus-visible:ring-4 focus-visible:ring-teal-100";

export function QuoteForm({
  requestId,
  providerId,
  initial,
}: {
  requestId: string;
  providerId: string;
  initial?: ServiceQuote | null;
}) {
  const [items, setItems] = useState<Item[]>(
    initial?.items.map((item) => ({
      item_type: item.itemType,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      is_optional: item.isOptional,
    })) ?? [empty("labor")],
  );
  const update = (index: number, patch: Partial<Item>) =>
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  const subtotal = (types: string[]) =>
    items
      .filter((item) => types.includes(item.item_type))
      .reduce((total, item) => total + item.quantity * item.unit_price, 0);
  const labor = subtotal(["labor"]);
  const parts = subtotal(["part"]);
  const additional = subtotal(["service", "additional"]);

  return (
    <form action={saveQuote} className="space-y-6">
      {initial && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          Valores persistidos recarregados do banco. Total salvo: {money(initial.totalAmount)}.
        </p>
      )}
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="providerId" value={providerId} />
      <input type="hidden" name="itemsJson" value={JSON.stringify(items)} />

      <div className="space-y-4">
        {items.map((item, index) => {
          const laborItem = item.item_type === "labor";
          const unit = laborItem ? "hora" : "unidade";
          return (
            <fieldset key={index} className="rounded-2xl border border-rose-100 bg-white p-4 sm:p-5">
              <legend className="px-2 text-sm font-semibold text-slate-800">
                Item {index + 1} · {itemTypeLabel(item.item_type)}
              </legend>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
                <Field label="Categoria">
                  <select
                    className={inputClass}
                    value={item.item_type}
                    onChange={(event) =>
                      update(index, {
                        item_type: event.target.value,
                        quantity:
                          event.target.value === "labor"
                            ? Math.max(item.quantity, 0.1)
                            : Math.max(1, Math.ceil(item.quantity)),
                      })
                    }
                  >
                    <option value="labor">Mão de obra</option>
                    <option value="part">Peça</option>
                    <option value="service">Serviço</option>
                    <option value="additional">Adicional</option>
                  </select>
                </Field>
                <Field label="Descrição" wide>
                  <input className={inputClass} required value={item.description} onChange={(event) => update(index, { description: event.target.value })} />
                </Field>
                <Field label={laborItem ? "Horas ou quantidade" : "Quantidade"}>
                  <input className={inputClass} required type="number" min={laborItem ? 0.1 : 1} step={laborItem ? 0.1 : 1} value={item.quantity} onChange={(event) => update(index, { quantity: Number(event.target.value) })} />
                </Field>
                <Field label="Valor unitário">
                  <input className={inputClass} required type="number" min="0.01" step="0.01" value={item.unit_price || ""} onChange={(event) => update(index, { unit_price: Number(event.target.value) })} />
                </Field>
                <Field label="Opcional">
                  <label className="mt-2 flex h-11 items-center gap-2 rounded-xl border border-rose-100 px-3 text-sm font-normal">
                    <input type="checkbox" checked={item.is_optional} onChange={(event) => update(index, { is_optional: event.target.checked })} className="h-4 w-4 accent-teal-700" /> Sim
                  </label>
                </Field>
              </div>
              <div className="mt-4 flex flex-col gap-3 border-t border-rose-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-600">
                  {item.quantity.toLocaleString("pt-BR")} {unit}{item.quantity === 1 ? "" : "s"} × {money(item.unit_price)} = <strong className="tabular-nums text-slate-900">{money(item.quantity * item.unit_price)}</strong>
                </p>
                <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold text-red-700 outline-none hover:bg-red-50 focus-visible:ring-4 focus-visible:ring-red-100" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" /> Remover item
                </button>
              </div>
              {laborItem && item.is_optional && (
                <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  Confirme se esta mão de obra realmente pode ser recusada sem impedir o serviço.
                </p>
              )}
            </fieldset>
          );
        })}
      </div>

      <button type="button" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 text-sm font-semibold text-teal-800 outline-none hover:bg-teal-100 focus-visible:ring-4 focus-visible:ring-teal-100 sm:w-auto" onClick={() => setItems((current) => [...current, empty()])}>
        <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar item
      </button>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Prazo estimado"><input className={inputClass} name="estimatedDuration" defaultValue={initial?.estimatedDuration ?? ""} placeholder="Ex.: 2 horas ou 1 dia útil" /></Field>
        <Field label="Validade do orçamento"><input className={inputClass} name="validUntil" defaultValue={initial?.validUntil ?? ""} type="date" /></Field>
        <Field label="Observações técnicas"><textarea className="mt-2 min-h-28 w-full rounded-xl border border-rose-100 p-3 outline-none focus-visible:border-teal-500 focus-visible:ring-4 focus-visible:ring-teal-100" name="technicalNotes" defaultValue={initial?.technicalNotes ?? ""} /></Field>
        <Field label="Resumo para a cliente"><textarea className="mt-2 min-h-28 w-full rounded-xl border border-rose-100 p-3 outline-none focus-visible:border-teal-500 focus-visible:ring-4 focus-visible:ring-teal-100" name="customerSummary" defaultValue={initial?.customerSummary ?? ""} /></Field>
        <Field label="Garantia"><textarea className="mt-2 min-h-28 w-full rounded-xl border border-rose-100 p-3 outline-none focus-visible:border-teal-500 focus-visible:ring-4 focus-visible:ring-teal-100" name="warrantyText" defaultValue={initial?.warrantyText ?? ""} /></Field>
      </div>

      <section aria-label="Prévia financeira" className="grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-3 sm:p-5">
        <PreviewMoney label="Mão de obra" value={labor} />
        <PreviewMoney label="Peças" value={parts} />
        <PreviewMoney label="Serviços e adicionais" value={additional} />
        <div className="border-t border-slate-200 pt-4 sm:col-span-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Total geral</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-teal-800">{money(labor + parts + additional)}</p>
          <p className="mt-2 text-xs text-slate-500">Prévia local. Após salvar, os valores exibidos são recarregados do banco.</p>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <button name="intent" value="draft" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-200 px-4 font-semibold text-slate-800 outline-none hover:bg-slate-300 focus-visible:ring-4 focus-visible:ring-slate-200">
          <Save className="h-4 w-4" aria-hidden="true" /> Salvar rascunho
        </button>
        <button name="intent" value="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 font-semibold text-white outline-none hover:bg-teal-800 focus-visible:ring-4 focus-visible:ring-teal-100">
          <Send className="h-4 w-4" aria-hidden="true" /> Enviar para aprovação
        </button>
      </div>
    </form>
  );
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={`text-sm font-semibold text-slate-700 ${wide ? "lg:col-span-2" : ""}`}>{label}{children}</label>;
}
function PreviewMoney({ label, value }: { label: string; value: number }) {
  return <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 font-semibold tabular-nums text-slate-800">{money(value)}</p></div>;
}
function itemTypeLabel(type: string) {
  return type === "labor" ? "Mão de obra" : type === "part" ? "Peça" : type === "service" ? "Serviço" : "Adicional";
}
