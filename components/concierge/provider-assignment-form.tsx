"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { assignProvider, reassignProvider } from "@/services/service-providers/actions";
import type { ServiceProvider } from "@/types/service-provider";

export function ProviderAssignmentForm({
  requestId,
  providers,
  currentProviderId,
  mode,
}: {
  requestId: string;
  providers: ServiceProvider[];
  currentProviderId?: string | null;
  mode: "assign" | "reassign";
}) {
  const available = providers.filter(
    (provider) => provider.id !== currentProviderId,
  );
  const [providerId, setProviderId] = useState(available[0]?.id ?? "");
  const selected = available.find((provider) => provider.id === providerId);
  const action = mode === "reassign" ? reassignProvider : assignProvider;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="serviceRequestId" value={requestId} />
      <label className="block text-sm font-semibold">
        {mode === "reassign" ? "Novo prestador" : "Prestador"}
        <select
          name="providerId"
          value={providerId}
          onChange={(event) => setProviderId(event.target.value)}
          required
          className="mt-2 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
        >
          <option value="" disabled>
            Selecione
          </option>
          {available.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name} · {provider.city} · ★ {provider.rating ?? "—"} ·{" "}
              {provider.portalActive ? "Portal ativo" : "Sem acesso ao portal"}
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <p className="font-semibold">
            {selected.portalActive
              ? "✓ Portal ativo"
              : "⚠ Sem acesso ao portal"}
          </p>
          <p className="mt-1 text-muted-foreground">
            {selected.city} ·{" "}
            {selected.specialties.join(", ") || "Especialidades não informadas"}
          </p>
        </div>
      )}
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
              className="mt-2 min-h-24 w-full rounded-md border border-border p-3 font-normal"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            A alteração ficará indisponível após o envio do orçamento.
          </p>
        </>
      )}
      <Button className="h-11 w-full" disabled={!available.length}>
        {mode === "reassign" ? "Confirmar alteração" : "Indicar prestador"}
      </Button>
    </form>
  );
}
