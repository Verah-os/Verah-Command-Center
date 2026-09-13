"use client";

import type { ReactNode } from "react";
import {
  registerVehicleChargingStep,
  registerVehicleDocumentStep,
  registerVehicleExpenseStep,
  registerVehicleFuelStep,
  registerVehicleMaintenanceStep,
  registerVehicleMileageStep,
  removeVehicleDocumentStep,
} from "@/services/customer-vehicle-log/actions";
import {
  CHARGING_TYPES,
  CHARGING_TYPE_LABELS,
  DOCUMENT_KINDS,
  DOCUMENT_KIND_LABELS,
  FUEL_TYPES,
  FUEL_TYPE_LABELS,
  MAINTENANCE_TYPES,
  MAINTENANCE_TYPE_LABELS,
} from "@/lib/customer-vehicle-log";

const fieldClass =
  "mt-2 h-12 w-full rounded-xl border border-rose-100 bg-white px-4 text-base outline-none focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-accent/30 disabled:bg-slate-50 disabled:text-slate-400";
const selectClass = fieldClass;
const labelClass = "text-sm font-semibold text-slate-700";
const submitClass =
  "min-h-12 rounded-xl bg-accent px-5 font-semibold text-white outline-none hover:bg-accent/90 focus-visible:ring-4 focus-visible:ring-accent/30 disabled:opacity-60";

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`${labelClass} ${className}`}>
      {label}
      {children}
    </label>
  );
}

export function RegisterVehicleMileageForm({ vehicleId, defaultValue }: { vehicleId: string; defaultValue?: number }) {
  return (
    <form action={registerVehicleMileageStep} className="mt-5 grid gap-5 sm:grid-cols-2">
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <Field label="Quilometragem atual (km)">
        <input
          name="mileageValue"
          className={fieldClass}
          type="number"
          inputMode="numeric"
          min={defaultValue ?? 0}
          step={1}
          defaultValue=""
          required
          placeholder={defaultValue !== undefined ? `Mínimo ${defaultValue}` : "Ex.: 65000"}
        />
      </Field>
      <Field label="Observação (opcional)" className="sm:col-span-2">
        <textarea name="note" className={`${fieldClass} h-24 py-3`} maxLength={200} placeholder="Ex.: revisão periódica" />
      </Field>
      <div className="sm:col-span-2">
        <button className={submitClass} type="submit">Registrar quilometragem</button>
      </div>
    </form>
  );
}

export function RegisterVehicleFuelForm({ vehicleId, defaultOdometer }: { vehicleId: string; defaultOdometer?: number | null }) {
  return (
    <form action={registerVehicleFuelStep} className="mt-5 grid gap-5 sm:grid-cols-2">
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <Field label="Hodômetro (km)">
        <input name="odometerValue" className={fieldClass} type="number" inputMode="numeric" min={0} step={1} required autoFocus placeholder={defaultOdometer !== null && defaultOdometer !== undefined && defaultOdometer > 0 ? String(defaultOdometer) : "Ex.: 42000"} />
      </Field>
      <Field label="Litros abastecidos">
        <input name="liters" className={fieldClass} type="text" inputMode="decimal" required placeholder="Ex.: 42,5" />
      </Field>
      <Field label="Valor total (R$)">
        <input name="totalAmount" className={fieldClass} type="text" inputMode="decimal" required placeholder="Ex.: 250,00" />
      </Field>
      <Field label="Combustível">
        <select name="fuelType" className={selectClass} defaultValue="gasolina">
          {FUEL_TYPES.map((type) => (
            <option key={type} value={type}>{FUEL_TYPE_LABELS[type]}</option>
          ))}
        </select>
      </Field>
      <Field label="Observação (opcional)" className="sm:col-span-2">
        <textarea name="note" className={`${fieldClass} h-24 py-3`} maxLength={200} placeholder="Ex.: posto da esquina" />
      </Field>
      <div className="sm:col-span-2">
        <button className={submitClass} type="submit">Registrar abastecimento</button>
      </div>
    </form>
  );
}

export function RegisterVehicleChargingForm({ vehicleId, defaultOdometer }: { vehicleId: string; defaultOdometer?: number | null }) {
  return (
    <form action={registerVehicleChargingStep} className="mt-5 grid gap-5 sm:grid-cols-2">
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <Field label="Hodômetro (km)">
        <input name="odometerValue" className={fieldClass} type="number" inputMode="numeric" min={0} step={1} required placeholder={defaultOdometer !== null && defaultOdometer !== undefined && defaultOdometer > 0 ? String(defaultOdometer) : "Ex.: 33500"} />
      </Field>
      <Field label="Energia (kWh)">
        <input name="kwh" className={fieldClass} type="text" inputMode="decimal" required placeholder="Ex.: 38,4" />
      </Field>
      <Field label="Valor total (R$)">
        <input name="totalAmount" className={fieldClass} type="text" inputMode="decimal" required placeholder="Ex.: 78,00" />
      </Field>
      <Field label="Bateria ao fim (%, opcional)">
        <input name="batteryPercent" className={fieldClass} type="number" inputMode="numeric" min={0} max={100} step={1} placeholder="Ex.: 85" />
      </Field>
      <Field label="Tipo de recarga">
        <select name="chargingType" className={selectClass} defaultValue="recarga_publica">
          {CHARGING_TYPES.map((type) => (
            <option key={type} value={type}>{CHARGING_TYPE_LABELS[type]}</option>
          ))}
        </select>
      </Field>
      <Field label="Observação (opcional)" className="sm:col-span-2">
        <textarea name="note" className={`${fieldClass} h-24 py-3`} maxLength={200} placeholder="Ex.: carregador público do shopping" />
      </Field>
      <div className="sm:col-span-2">
        <button className={submitClass} type="submit">Registrar recarga</button>
      </div>
    </form>
  );
}

export function RegisterVehicleMaintenanceForm({ vehicleId, defaultOdometer }: { vehicleId: string; defaultOdometer?: number | null }) {
  return (
    <form action={registerVehicleMaintenanceStep} className="mt-5 grid gap-5 sm:grid-cols-2">
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <Field label="Tipo de manutenção">
        <select name="maintenanceType" className={selectClass} defaultValue="">
          <option value="">Selecione</option>
          {MAINTENANCE_TYPES.map((type) => (
            <option key={type} value={type}>{MAINTENANCE_TYPE_LABELS[type]}</option>
          ))}
        </select>
      </Field>
      <Field label="Descrição">
        <input name="description" className={fieldClass} maxLength={160} required placeholder="Ex.: Troca de óleo com filtro" />
      </Field>
      <Field label="Data">
        <input name="occurredOn" className={fieldClass} type="date" required />
      </Field>
      <Field label="Quilometragem (km)">
        <input name="odometerKm" className={fieldClass} type="number" inputMode="numeric" min={0} step={1} required placeholder={defaultOdometer !== null && defaultOdometer !== undefined && defaultOdometer > 0 ? String(defaultOdometer) : "Ex.: 41000"} />
      </Field>
      <Field label="Custo (R$, opcional)">
        <input name="amountCents" className={fieldClass} type="text" inputMode="decimal" placeholder="Ex.: 320,00" />
      </Field>
      <Field label="Próximo vencimento (opcional)">
        <input name="nextDueOn" className={fieldClass} type="date" />
      </Field>
      <Field label="Próximo vencimento em (km, opcional)">
        <input name="nextDueKm" className={fieldClass} type="number" inputMode="numeric" min={0} step={1} placeholder="Ex.: 51000" />
      </Field>
      <label className="flex items-center gap-3 text-sm font-semibold text-slate-700 sm:col-span-2">
        <input name="createExpense" type="checkbox" defaultChecked className="h-5 w-5 rounded border-rose-200 accent-[var(--verah-pink)]" />
        Registrar como despesa também (mão de obra e peças)
      </label>
      <div className="sm:col-span-2">
        <button className={submitClass} type="submit">Registrar manutenção</button>
      </div>
    </form>
  );
}

export function RegisterVehicleExpenseForm({ vehicleId, defaultOdometer }: { vehicleId: string; defaultOdometer?: number | null }) {
  return (
    <form action={registerVehicleExpenseStep} className="mt-5 grid gap-5 sm:grid-cols-2">
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <Field label="Categoria">
        <select name="category" className={selectClass} defaultValue="combustivel">
          <option value="combustivel">Combustível</option>
          <option value="manutencao">Manutenção</option>
          <option value="outros">Outros</option>
        </select>
      </Field>
      <Field label="Valor (R$)">
        <input name="amountCents" className={fieldClass} type="text" inputMode="decimal" required placeholder="Ex.: 120,00" />
      </Field>
      <Field label="Data">
        <input name="occurredOn" className={fieldClass} type="date" required />
      </Field>
      <Field label="Quilometragem (km, opcional)">
        <input name="odometerKm" className={fieldClass} type="number" inputMode="numeric" min={0} step={1} placeholder={defaultOdometer !== null && defaultOdometer !== undefined && defaultOdometer > 0 ? String(defaultOdometer) : ""} />
      </Field>
      <Field label="Descrição (opcional)" className="sm:col-span-2">
        <input name="description" className={fieldClass} maxLength={160} placeholder="Ex.: estacionamento" />
      </Field>
      <div className="sm:col-span-2">
        <button className={submitClass} type="submit">Registrar despesa</button>
      </div>
    </form>
  );
}

export function RegisterVehicleDocumentForm({ vehicleId }: { vehicleId: string }) {
  return (
    <form action={registerVehicleDocumentStep} className="mt-5 grid gap-5 sm:grid-cols-2">
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <Field label="Tipo de documento">
        <select name="documentKind" className={selectClass} defaultValue="">
          <option value="">Selecione</option>
          {DOCUMENT_KINDS.map((kind) => (
            <option key={kind} value={kind}>{DOCUMENT_KIND_LABELS[kind]}</option>
          ))}
        </select>
      </Field>
      <Field label="Data do documento">
        <input name="documentDate" className={fieldClass} type="date" max={todayIso()} required />
      </Field>
      <Field label="Arquivo (PDF, JPEG, PNG ou WebP · até 10 MB)">
        <input name="file" className={`${fieldClass} pt-3`} type="file" accept=".pdf,image/jpeg,image/png,image/webp" required />
      </Field>
      <Field label="Referência (opcional)">
        <input name="reference" className={fieldClass} maxLength={80} placeholder="Ex.: NF 1234" />
      </Field>
      <Field label="Observação (opcional)" className="sm:col-span-2">
        <textarea name="note" className={`${fieldClass} h-24 py-3`} maxLength={160} placeholder="Ex.: manual original do veículo" />
      </Field>
      <div className="sm:col-span-2">
        <button className={submitClass} type="submit">Anexar documento</button>
      </div>
    </form>
  );
}

export function RemoveVehicleDocumentForm({ vehicleId, documentId }: { vehicleId: string; documentId: string }) {
  return (
    <form action={removeVehicleDocumentStep}>
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <input type="hidden" name="documentId" value={documentId} />
      <button type="submit" className="text-xs font-semibold text-rose-600 underline-offset-2 outline-none hover:underline focus-visible:ring-4 focus-visible:ring-rose-200">Remover</button>
    </form>
  );
}

function todayIso() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}