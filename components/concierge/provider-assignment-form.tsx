"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  assignProvider,
  reassignProvider,
} from "@/services/service-providers/actions";
import type { ServiceProvider } from "@/types/service-provider";

export function ProviderAssignmentForm({
  requestId,
  providers,
  currentProviderId,
  mode,
  requestCity,
  probableCategory,
}: {
  requestId: string;
  providers: ServiceProvider[];
  currentProviderId?: string | null;
  mode: "assign" | "reassign";
  requestCity: string;
  probableCategory: string | null;
}) {
  const available = providers.filter(
    (provider) => provider.id !== currentProviderId,
  );
  const [providerId, setProviderId] = useState(available[0]?.id ?? "");
  const selected = available.find((provider) => provider.id === providerId);
  const action = mode === "reassign" ? reassignProvider : assignProvider;
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="serviceRequestId" value={requestId} />
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">
          {mode === "reassign" ? "Novo prestador" : "Prestador"}
        </legend>
        {available.map((provider, index) => (
          <label
            key={provider.id}
            className={`block cursor-pointer rounded-2xl border p-4 text-sm transition ${providerId === provider.id ? "border-teal-500 bg-teal-50 shadow-sm" : "border-rose-100 bg-white hover:border-teal-200"}`}
          >
            <span className="flex items-start gap-3">
              <input
                type="radio"
                name="providerId"
                value={provider.id}
                checked={providerId === provider.id}
                onChange={() => setProviderId(provider.id)}
                required
                className="mt-1 h-4 w-4 accent-teal-700"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <strong>
                    {index + 1}º · {provider.name}
                  </strong>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${provider.portalActive ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}
                  >
                    {provider.portalActive
                      ? "Portal ativo"
                      : "Sem acesso ao portal"}
                  </span>
                </span>
                <span className="mt-2 block text-muted-foreground">
                  {provider.city} · ★ {provider.rating?.toFixed(1) ?? "—"}
                </span>
                <span className="mt-1 block text-muted-foreground">
                  {provider.specialties.length
                    ? provider.specialties.map(naturalLabel).join(", ")
                    : "Especialidades não informadas"}
                </span>
                <span className="mt-2 block text-xs text-muted-foreground">
                  {providerReason(provider, requestCity, probableCategory)}
                </span>
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      {selected && !selected.portalActive && (
        <>
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            Este prestador ainda não possui acesso ao portal e não poderá
            continuar a jornada nesta demonstração.
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" required className="mt-1" />
            Confirmo que desejo continuar mesmo sem portal ativo.
          </label>
        </>
      )}
      {mode === "reassign" && (
        <>
          <label className="block text-sm font-semibold">
            Motivo da alteração
            <textarea
              name="reason"
              required
              className="mt-2 min-h-24 w-full rounded-xl border border-rose-100 p-3 font-normal outline-none focus-visible:border-teal-500 focus-visible:ring-4 focus-visible:ring-teal-100"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            A alteração ficará indisponível após o envio do orçamento.
          </p>
        </>
      )}
      <Button className="min-h-12 w-full rounded-xl bg-teal-700 shadow-sm hover:bg-teal-800" disabled={!available.length}>
        {mode === "reassign" ? "Confirmar alteração" : "Indicar prestador"}
      </Button>
    </form>
  );
}

function providerReason(
  provider: ServiceProvider,
  city: string,
  category: string | null,
) {
  const sameCity = provider.city.localeCompare(city, "pt-BR", {
    sensitivity: "base",
  }) === 0;
  const compatible = Boolean(
    category && provider.specialties.includes(category),
  );
  const reasons = [
    provider.portalActive ? "possui portal ativo" : null,
    sameCity ? `atende em ${city}` : null,
    compatible
      ? `possui especialidade compatível com ${naturalLabel(category!)}`
      : null,
    provider.rating !== null
      ? `tem avaliação ${provider.rating.toFixed(1)}`
      : null,
  ].filter(Boolean);
  return reasons.length
    ? `Recomendado porque ${reasons.join(", ")}.`
    : "Prestador ativo da rede VERAH.";
}

function naturalLabel(value: string) {
  const label = value.replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}
