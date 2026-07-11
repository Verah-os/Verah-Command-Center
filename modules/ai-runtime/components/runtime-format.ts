export function formatRuntimeDate(value: string | null): string {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "America/Sao_Paulo"
  }).format(new Date(value));
}

export function formatPercentage(value: number | null): string {
  return value === null ? "Not available" : `${value.toFixed(1)}%`;
}

export function formatDuration(value: number | null): string {
  return value === null ? "Not available" : `${value.toFixed(1)} ms`;
}
