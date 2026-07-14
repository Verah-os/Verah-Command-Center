"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  brazilianStates,
  citiesForState,
  isValidLocation,
} from "@/data/locations";
import { isValidVehicle, modelsForBrand, vehicleBrands } from "@/data/vehicles";
import {
  analyzeServiceRequest,
  type ServiceUrgency,
} from "@/services/service-copilot";
import { createServiceRequest } from "@/services/service-requests/actions";

type Values = {
  customerName: string;
  customerPhone: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleYear: string;
  vehiclePlate: string;
  hasInsurance: "yes" | "no" | "unknown";
  insurerName: string;
  hasRoadsideAssistance: "yes" | "no" | "unknown";
  state: string;
  city: string;
  customerReport: string;
  perceivedUrgency: ServiceUrgency;
};
const initial: Values = {
  customerName: "",
  customerPhone: "",
  vehicleBrand: "",
  vehicleModel: "",
  vehicleYear: "",
  vehiclePlate: "",
  hasInsurance: "unknown",
  insurerName: "",
  hasRoadsideAssistance: "unknown",
  state: "",
  city: "",
  customerReport: "",
  perceivedUrgency: "media",
};
const fieldClass =
  "mt-2 h-12 w-full rounded-xl border border-rose-100 bg-white px-4 text-base outline-none transition focus-visible:border-teal-600 focus-visible:ring-4 focus-visible:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-100";

export function ServiceRequestForm({ serverError }: { serverError?: string }) {
  const [values, setValues] = useState(initial);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState(serverError ?? "");
  const models = modelsForBrand(values.vehicleBrand);
  const cities = citiesForState(values.state);
  const analysis = useMemo(
    () =>
      reviewing
        ? analyzeServiceRequest({
            customerReport: values.customerReport,
            vehicleBrand: values.vehicleBrand,
            vehicleModel: values.vehicleModel,
            vehicleYear: values.vehicleYear ? Number(values.vehicleYear) : null,
            city: values.city,
            perceivedUrgency: values.perceivedUrgency,
          })
        : null,
    [reviewing, values],
  );

  function update(name: keyof Values, value: string) {
    setValues((current) => ({
      ...current,
      [name]: value,
      ...(name === "vehicleBrand" ? { vehicleModel: "" } : {}),
      ...(name === "state" ? { city: "" } : {}),
    }));
    setReviewing(false);
    setError("");
  }
  function review() {
    const year = Number(values.vehicleYear);
    const maximumYear = new Date().getFullYear() + 1;
    if (!values.customerName || values.customerReport.length < 15)
      return setError(
        "Preencha seu nome e conte o que aconteceu com um pouco mais de detalhe.",
      );
    if (!isValidVehicle(values.vehicleBrand, values.vehicleModel))
      return setError("Selecione uma marca e um modelo válidos da lista.");
    if (!isValidLocation(values.state, values.city))
      return setError("Selecione um estado e uma cidade válidos da lista.");
    if (
      values.vehicleYear &&
      (!/^\d{4}$/.test(values.vehicleYear) || year < 1950 || year > maximumYear)
    )
      return setError(
        `Informe um ano entre 1950 e ${maximumYear}, usando quatro dígitos.`,
      );
    setError("");
    setReviewing(true);
  }

  return (
    <form action={createServiceRequest} className="space-y-6" noValidate>
      {Object.entries(values).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Progress current={reviewing ? 2 : 1} />
      {!reviewing ? (
        <Card className="overflow-hidden border-rose-100 shadow-[0_18px_50px_rgba(82,54,64,0.08)]">
          <CardContent className="space-y-8 p-5 sm:p-8">
            <Section title="Seus dados" eyebrow="A">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  id="customer-name"
                  label="Nome"
                  name="customerName"
                  value={values.customerName}
                  update={update}
                  required
                />
                <Field
                  id="customer-phone"
                  label="Telefone"
                  name="customerPhone"
                  value={values.customerPhone}
                  update={update}
                  type="tel"
                />
              </div>
            </Section>
            <Section title="Seu veículo" eyebrow="B">
              <div className="grid gap-5 sm:grid-cols-2">
                <Autocomplete
                  id="vehicle-brand"
                  label="Marca"
                  value={values.vehicleBrand}
                  options={vehicleBrands}
                  onChange={(value) => update("vehicleBrand", value)}
                  listId="vehicle-brands"
                  required
                />
                <Autocomplete
                  id="vehicle-model"
                  label="Modelo"
                  value={values.vehicleModel}
                  options={models}
                  onChange={(value) => update("vehicleModel", value)}
                  listId="vehicle-models"
                  disabled={!models.length}
                  placeholder={
                    !models.length
                      ? "Selecione a marca primeiro"
                      : "Digite para pesquisar"
                  }
                  required
                />
                <Field
                  id="vehicle-year"
                  label="Ano"
                  name="vehicleYear"
                  value={values.vehicleYear}
                  update={update}
                  inputMode="numeric"
                  placeholder="Ex.: 2020"
                />
                <Field
                  id="vehicle-plate"
                  label="Placa"
                  name="vehiclePlate"
                  value={values.vehiclePlate}
                  update={update}
                  placeholder="Opcional"
                />
              </div>
            </Section>
            <Section title="Seguro e assistência" eyebrow="C">
              <div className="grid gap-5 sm:grid-cols-2">
                <label
                  htmlFor="has-insurance"
                  className="text-sm font-semibold text-slate-700"
                >
                  Possui seguro?
                  <select
                    id="has-insurance"
                    className={fieldClass}
                    value={values.hasInsurance}
                    onChange={(event) =>
                      update(
                        "hasInsurance",
                        event.target.value as Values["hasInsurance"],
                      )
                    }
                  >
                    <option value="yes">Sim</option>
                    <option value="no">Não</option>
                    <option value="unknown">Não sei</option>
                  </select>
                </label>
                {values.hasInsurance === "yes" && (
                  <Field
                    id="insurer-name"
                    label="Seguradora (opcional)"
                    name="insurerName"
                    value={values.insurerName}
                    update={update}
                    placeholder="Nome da seguradora"
                  />
                )}
                <label
                  htmlFor="has-roadside-assistance"
                  className="text-sm font-semibold text-slate-700"
                >
                  Possui assistência 24 horas?
                  <select
                    id="has-roadside-assistance"
                    className={fieldClass}
                    value={values.hasRoadsideAssistance}
                    onChange={(event) =>
                      update(
                        "hasRoadsideAssistance",
                        event.target
                          .value as Values["hasRoadsideAssistance"],
                      )
                    }
                  >
                    <option value="yes">Sim</option>
                    <option value="no">Não</option>
                    <option value="unknown">Não sei</option>
                  </select>
                </label>
              </div>
              <p className="mt-4 text-xs leading-5 text-slate-500">
                Não solicitamos número da apólice, CPF ou dados financeiros.
              </p>
            </Section>
            <Section title="Onde você está" eyebrow="D">
              <div className="grid gap-5 sm:grid-cols-2">
                <label
                  htmlFor="state"
                  className="text-sm font-semibold text-slate-700"
                >
                  Estado <span aria-hidden="true">*</span>
                  <select
                    id="state"
                    className={fieldClass}
                    value={values.state}
                    onChange={(event) => update("state", event.target.value)}
                    required
                  >
                    <option value="">Selecione a UF</option>
                    {brazilianStates.map(([code, name]) => (
                      <option key={code} value={code}>
                        {code} — {name}
                      </option>
                    ))}
                  </select>
                </label>
                <Autocomplete
                  id="city"
                  label="Cidade"
                  value={values.city}
                  options={cities}
                  onChange={(value) => update("city", value)}
                  listId="state-cities"
                  disabled={!values.state}
                  placeholder={
                    !values.state
                      ? "Selecione o estado primeiro"
                      : "Digite para pesquisar"
                  }
                  required
                />
              </div>
            </Section>
            <Section title="O que aconteceu" eyebrow="E">
              <div className="grid gap-5">
                <label
                  htmlFor="customer-report"
                  className="text-sm font-semibold text-slate-700"
                >
                  Conte com suas palavras <span aria-hidden="true">*</span>
                  <textarea
                    id="customer-report"
                    className="mt-2 min-h-40 w-full resize-y rounded-xl border border-rose-100 bg-white p-4 text-base outline-none focus-visible:border-teal-600 focus-visible:ring-4 focus-visible:ring-teal-100"
                    value={values.customerReport}
                    onChange={(event) =>
                      update("customerReport", event.target.value)
                    }
                    aria-describedby="report-help"
                    required
                  />
                  <span
                    id="report-help"
                    className="mt-2 block text-xs font-normal text-slate-500"
                  >
                    Inclua quando começou, ruídos, luzes no painel ou mudanças
                    percebidas.
                  </span>
                </label>
                <label
                  htmlFor="urgency"
                  className="text-sm font-semibold text-slate-700"
                >
                  Urgência percebida <span aria-hidden="true">*</span>
                  <select
                    id="urgency"
                    className={fieldClass}
                    value={values.perceivedUrgency}
                    onChange={(event) =>
                      update("perceivedUrgency", event.target.value)
                    }
                  >
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                    <option value="critica">Crítica</option>
                  </select>
                </label>
              </div>
            </Section>
            {error && (
              <p
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
              >
                {error}
              </p>
            )}
            <Button
              type="button"
              className="h-13 min-h-12 w-full rounded-xl text-base"
              onClick={review}
            >
              Analisar com a VERAH
            </Button>
          </CardContent>
        </Card>
      ) : (
        analysis && (
          <div className="space-y-5">
            <Card className="overflow-hidden border-teal-100 shadow-[0_18px_50px_rgba(40,91,85,0.09)]">
              <CardContent className="space-y-6 p-5 sm:p-8">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
                    Análise inicial
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold">
                    Entendemos o seu relato
                  </h2>
                  <p className="mt-3 leading-7 text-slate-600">
                    {analysis.summary}
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Info
                    label="Categoria provável"
                    value={naturalLabel(analysis.probableCategory)}
                  />
                  <UrgencyBadge urgency={analysis.urgency} />
                  <Info
                    label="Confiança"
                    value={`${Math.round(analysis.confidence * 100)}%`}
                  />
                </div>
                <Info
                  label="Próximo passo"
                  value={analysis.recommendedNextStep}
                />
                <Info
                  label="Mensagem da VERAH"
                  value={analysis.customerMessage}
                />
                <List
                  label="Sinais de risco"
                  items={analysis.riskSignals}
                  empty="Nenhum sinal específico identificado no relato."
                />
                <List
                  label="Perguntas pendentes"
                  items={analysis.missingQuestions}
                />
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                  ⓘ Esta é uma triagem inicial, não um diagnóstico mecânico. Uma
                  pessoa da equipe VERAH revisará as informações.
                </p>
              </CardContent>
            </Card>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                type="button"
                variant="secondary"
                className="min-h-12 rounded-xl text-base"
                onClick={() => setReviewing(false)}
              >
                Editar informações
              </Button>
              <Button type="submit" className="min-h-12 rounded-xl text-base">
                Confirmar e criar atendimento
              </Button>
            </div>
          </div>
        )
      )}
    </form>
  );
}

function Progress({ current }: { current: number }) {
  return (
    <ol
      aria-label="Progresso do atendimento"
      className="grid grid-cols-3 gap-2"
    >
      {["Informações", "Análise", "Confirmação"].map((label, index) => (
        <li
          key={label}
          className={`rounded-xl border px-2 py-3 text-center text-xs font-semibold sm:text-sm ${index + 1 <= current ? "border-teal-200 bg-teal-50 text-teal-900" : "border-slate-200 bg-white text-slate-400"}`}
        >
          <span className="mr-1">{index + 1}.</span>
          {label}
        </li>
      ))}
    </ol>
  );
}
function Section({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className="mb-5 flex items-center gap-3 text-lg font-semibold">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-100 text-sm text-rose-700">
          {eyebrow}
        </span>
        {title}
      </legend>
      {children}
    </fieldset>
  );
}
function Field({
  id,
  label,
  name,
  value,
  update,
  type = "text",
  required,
  inputMode,
  placeholder,
}: {
  id: string;
  label: string;
  name: keyof Values;
  value: string;
  update: (name: keyof Values, value: string) => void;
  type?: string;
  required?: boolean;
  inputMode?: "numeric";
  placeholder?: string;
}) {
  return (
    <label htmlFor={id} className="text-sm font-semibold text-slate-700">
      {label}
      {required && (
        <>
          {" "}
          <span aria-hidden="true">*</span>
        </>
      )}
      <input
        id={id}
        className={fieldClass}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        value={value}
        onChange={(event) => update(name, event.target.value)}
        required={required}
      />
    </label>
  );
}
function Autocomplete({
  id,
  label,
  value,
  options,
  onChange,
  listId,
  disabled,
  placeholder,
  required,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  listId: string;
  disabled?: boolean;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label htmlFor={id} className="text-sm font-semibold text-slate-700">
      {label}
      {required && (
        <>
          {" "}
          <span aria-hidden="true">*</span>
        </>
      )}
      <input
        id={id}
        className={fieldClass}
        list={listId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={placeholder ?? "Digite para pesquisar"}
        autoComplete="off"
        required={required}
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </label>
  );
}
function naturalLabel(value: string) {
  const label = value.replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 leading-6 text-slate-800">{value}</p>
    </div>
  );
}
function UrgencyBadge({ urgency }: { urgency: ServiceUrgency }) {
  const styles = {
    baixa: "bg-emerald-50 text-emerald-800 border-emerald-200",
    media: "bg-amber-50 text-amber-900 border-amber-200",
    alta: "bg-orange-50 text-orange-900 border-orange-200",
    critica: "bg-red-50 text-red-900 border-red-200",
  };
  const icons = { baixa: "✓", media: "!", alta: "▲", critica: "⚠" };
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Urgência
      </p>
      <p
        className={`mt-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${styles[urgency]}`}
      >
        <span aria-hidden="true">{icons[urgency]}</span>
        {naturalLabel(urgency)}
      </p>
    </div>
  );
}
function List({
  label,
  items,
  empty,
}: {
  label: string;
  items: string[];
  empty?: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      {items.length ? (
        <ul className="mt-2 space-y-2 text-sm text-slate-700">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden="true">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-600">{empty}</p>
      )}
    </div>
  );
}
