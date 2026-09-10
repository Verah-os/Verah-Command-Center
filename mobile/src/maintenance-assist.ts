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

export type MaintenanceEditableFields = {
  type: string;
  description: string;
  date: string;
  km: string;
  amount: string;
  nextDate: string;
  nextKm: string;
};

// Apply the fail-closed assisted draft to the editable fields. The draft never
// extrapolates km/value/dates from the receipt photo: only the note, date placeholder
// and explicit confirmation are carried over. Returns fresh field values so the
// caller can populate editable inputs and then return to user review.

export function applyMaintenanceAssistedDraft(
  fields: MaintenanceEditableFields,
  draft: MaintenanceAssistedDraft,
): MaintenanceEditableFields {

  const fillOrKeep = (draftValue: string, fieldValue: string) =>
    draftValue.trim() ? draftValue : fieldValue;

  return {
    ...fields,
    description: draft.description,
    date: draft.date ?? fields.date,
    km: fillOrKeep(draft.km, fields.km),
    amount: fillOrKeep(draft.amount, fields.amount),
    nextDate: fillOrKeep(draft.nextDate, fields.nextDate),
    nextKm: fillOrKeep(draft.nextKm, fields.nextKm),
  };
}

export function hasAssistedDraftFields(draft: MaintenanceAssistedDraft | null): boolean {
  return draft !== null && (draft.description.trim() !== "" || draft.hasReceiptFile);
}

// The assisted flow never auto-persists OCR/extracted values: the final save must
// always go through an explicit customer confirmation before persisting canonical
// maintenance + private receipt document..

export function shouldConfirmAssistedSave(
  draft: MaintenanceAssistedDraft | null,
  hasEditedFields: boolean,
): boolean {
  return hasAssistedDraftFields(draft) && hasEditedFields;
}

export function buildMaintenanceReceiptDocumentInput(
  vehicleId: string,
  occurredOn: string,
  description: string,
  fileName: string,
): { documentKind: string; documentDate: string; fileName: string; mimeType: string; reference: string; note: string; idempotencyKey: string } {
  return {
    documentKind: "outro",
    documentDate: occurredOn,
    fileName,
    mimeType: "",
    reference: "recibo-de-manutencao",
    note: `Recibo de manutenção: ${description.trim().slice(0, 120)}`,
    idempotencyKey: `maintenance-receipt:${vehicleId}:${occurredOn}:${description.trim().slice(0, 80)}`,
  };
}

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