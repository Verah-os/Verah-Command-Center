import { BadgeCheck, MapPin, Star, Tags, UserRoundCheck } from "lucide-react";
import type { ServiceProvider } from "@/types/service-provider";

export function ProviderTrustPanel({
  provider,
  requestCity,
  probableCategory,
  reason,
}: {
  provider: ServiceProvider;
  requestCity: string;
  probableCategory: string | null;
  reason: string;
}) {
  const compatible = Boolean(
    probableCategory && provider.specialties.includes(probableCategory),
  );
  const sameCity = provider.city.localeCompare(requestCity, "pt-BR", {
    sensitivity: "base",
  }) === 0;
  return (
    <section aria-label="Confiança na recomendação" className="rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50 to-white p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white">
          <BadgeCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-800">Recomendação VERAH</p>
          <p className="mt-1 font-semibold text-slate-900">{provider.name}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2 text-xs text-slate-700 sm:grid-cols-2">
        <TrustItem icon={<MapPin className="h-3.5 w-3.5" aria-hidden="true" />} label={sameCity ? `Mesma cidade: ${provider.city}` : `Cidade: ${provider.city}`} />
        <TrustItem
          icon={<Tags className="h-3.5 w-3.5" aria-hidden="true" />}
          label={
            compatible
              ? `Especialidade compatível: ${naturalLabel(probableCategory!)}`
              : `Especialidades: ${provider.specialties.length ? provider.specialties.map(naturalLabel).join(", ") : "não informadas"}`
          }
        />
        <TrustItem icon={<Star className="h-3.5 w-3.5" aria-hidden="true" />} label={`Avaliação ${provider.rating?.toFixed(1) ?? "não informada"}`} />
        <TrustItem icon={<UserRoundCheck className="h-3.5 w-3.5" aria-hidden="true" />} label={provider.portalActive ? "Portal ativo" : "Portal ainda inativo"} />
      </div>
      <p className="mt-4 border-t border-teal-100 pt-4 text-sm leading-6 text-slate-600">{reason}</p>
    </section>
  );
}

function TrustItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2">
      <span className="text-teal-700">{icon}</span>
      <span>{label}</span>
    </span>
  );
}

function naturalLabel(value: string) {
  const label = value.replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}
