export type MaintenanceAssistedDraft = {
  date: string;
  description: string;
  amount: string;
  km: string;
  nextDate: string;
  nextKm: string;
  hasReceiptFile: boolean;
  requiresConfirmation: boolean;
};

// Fail-closed assisted draft: nenhum campo é extraído automaticamente do
// recibo. O cliente fornece a nota explicitamente e confirma cada campo antes
// do save canônico. Km/valor/data/próximas datas saem em branco, nunca
// derivados de foto/OCR.
export function buildMaintenanceAssistedDraft(input: {
  note: string;
  today: string;
  hasReceiptFile: boolean;
}): MaintenanceAssistedDraft {
  const note = input.note.trim();
  const description = note
    ? `Nota do recibo: ${note.slice(0, 160)}`
    : "Recibo anexado como documento privado do veículo.";
  return {
    date: input.today,
    description,
    amount: "",
    km: "",
    nextDate: "",
    nextKm: "",
    hasReceiptFile: input.hasReceiptFile,
    requiresConfirmation: true,
  };
}