"use client";

import { useState } from "react";
import { brazilianStates, citiesForState } from "@/data/locations";
import { updateCustomerVehicle } from "@/services/customer-vehicles/actions";
import type { CustomerVehicle } from "@/types/customer-vehicle";

const fieldClass =
  "mt-2 h-12 w-full rounded-xl border border-rose-100 bg-white px-4 text-base outline-none focus-visible:border-teal-600 focus-visible:ring-4 focus-visible:ring-teal-100";

export function VehicleEditForm({ vehicle }: { vehicle: CustomerVehicle }) {
  const [state, setState] = useState(vehicle.state ?? "");
  const [city, setCity] = useState(vehicle.city ?? "");
  const cities = citiesForState(state);
  return (
    <form action={updateCustomerVehicle} className="mt-5 grid gap-5 sm:grid-cols-2">
      <input type="hidden" name="vehicleId" value={vehicle.id} />
      <label className="text-sm font-semibold text-slate-700">
        Apelido
        <input
          name="nickname"
          className={fieldClass}
          defaultValue={vehicle.nickname ?? ""}
          maxLength={60}
          placeholder="Ex.: Meu Fox"
        />
      </label>
      <label className="text-sm font-semibold text-slate-700">
        Quilometragem atual
        <input
          name="currentMileage"
          className={fieldClass}
          defaultValue={vehicle.currentMileage ?? ""}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          placeholder="Ex.: 65000"
        />
      </label>
      <label className="text-sm font-semibold text-slate-700">
        Estado
        <select
          name="state"
          className={fieldClass}
          value={state}
          onChange={(event) => {
            setState(event.target.value);
            setCity("");
          }}
        >
          <option value="">Selecione</option>
          {brazilianStates.map(([code, name]) => (
            <option key={code} value={code}>{code} — {name}</option>
          ))}
        </select>
      </label>
      <label className="text-sm font-semibold text-slate-700">
        Cidade
        <input
          name="city"
          className={fieldClass}
          list="vehicle-cities"
          value={city}
          onChange={(event) => setCity(event.target.value)}
          disabled={!state}
          autoComplete="off"
        />
        <datalist id="vehicle-cities">
          {cities.map((name) => <option key={name} value={name} />)}
        </datalist>
      </label>
      <div className="sm:col-span-2">
        <button className="min-h-12 rounded-xl bg-teal-700 px-5 font-semibold text-white outline-none hover:bg-teal-800 focus-visible:ring-4 focus-visible:ring-teal-200">
          Salvar informações
        </button>
      </div>
    </form>
  );
}
