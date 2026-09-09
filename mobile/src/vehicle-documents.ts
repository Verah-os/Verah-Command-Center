export const VEHICLE_DOCUMENT_KINDS = [
  "nota_fiscal",
  "garantia",
  "manual",
  "laudo",
  "seguro",
  "licenciamento",
  "outro",
] as const;
export type VehicleDocumentKind = (typeof VEHICLE_DOCUMENT_KINDS)[number];

export const VEHICLE_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export type VehicleDocumentMimeType = (typeof VEHICLE_DOCUMENT_MIME_TYPES)[number];

export const MAX_VEHICLE_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10 MiB.

export const VEHICLE_DOCUMENT_KIND_LABELS: Record<VehicleDocumentKind, string> = {
  nota_fiscal: "Nota fiscal",
  garantia: "Garantia",
  manual: "Manual",
  laudo: "Laudo",
  seguro: "Seguro",
  licenciamento: "Licenciamento",
  outro: "Outro",
};

export type VehicleDocument = {
  id: string;
  vehicleId: string;
  documentKind: VehicleDocumentKind;
  documentDate: string;
  reference: string | null;
  note: string | null;
  fileName: string;
  mimeType: VehicleDocumentMimeType;
  sizeBytes: number;
  storageBucket: string;
  storagePath: string;
  status: "active" | "removed";
  createdAt: string;
};

export type VehicleDocumentInput = {
  documentKind: string;
  documentDate: string;
  fileName: string;
  mimeType: string;
  reference?: string;
  note?: string;
  idempotencyKey: string;
};

export type VehicleDocumentRegisterParams = {
  vehicleId: string;
  documentKind: VehicleDocumentKind;
  documentDate: string;
  fileName: string;
  mimeType: VehicleDocumentMimeType;
  sizeBytes: number;
  reference: string | null;
  note: string | null;
  idempotencyKey: string;
};

export type VehicleDocumentRegisterData = {
  documentId: string;
  storageBucket: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export type VehicleDocumentResult<T> = { ok: true; data: T } | { ok: false; message: string };

export type VehicleDocumentUploadError = { message: string; statusCode?: number } | null;

export type VehicleDocumentStore = {
  register(params: VehicleDocumentRegisterParams): Promise<{ data?: VehicleDocumentRegisterData; error?: { message: string } | null }>;
  upload(bucket: string, path: string, bytes: Blob, contentType: string): Promise<{ error?: VehicleDocumentUploadError }>;
  remove(documentId: string): Promise<{ error?: { message: string } | null }>;
};

const documentDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export function isVehicleDocumentDate(value: string, today: string): boolean {
  if (!documentDatePattern.test(value)) return false;
  if (value > today) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

export function validateVehicleDocumentInput(
  input: VehicleDocumentInput,
  sizeBytes: number,
  today: string,
  vehicleId: string,
): VehicleDocumentResult<VehicleDocumentRegisterParams> {
  const kind = input.documentKind.trim().toLowerCase();
  if (!(VEHICLE_DOCUMENT_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, message: "Selecione um tipo de documento válido." };
  }
  if (!isVehicleDocumentDate(input.documentDate, today)) {
    return { ok: false, message: "Informe uma data válida (AAAA-MM-DD, até hoje)." };
  }
  const fileName = input.fileName.trim();
  if (!fileName || fileName.length > 255) {
    return { ok: false, message: "Informe o nome do arquivo (até 255 caracteres." };
  }
  const mimeType = input.mimeType.trim();
  if (!(VEHICLE_DOCUMENT_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return { ok: false, message: "Tipo de arquivo não suportado. Use PDF, JPEG, PNG ou WebP." };
  }
  if (!Number.isInteger(sizeBytes) || sizeBytes <  1 || sizeBytes > MAX_VEHICLE_DOCUMENT_BYTES) {

    return { ok: false, message: "O arquivo deve ter entre 1 byte e 10 MiB." };
  }
  const reference = input.reference?.trim() || null;
  if (reference && reference.length > 80) {
    return { ok: false, message: "Referência muito longa (limite de 80 caracteres." };
  }
  const note = input.note?.trim() || null;
  if (note && note.length > 160) {
    return { ok: false, message: "Observação muito longa (limite de 160 caracteres." };
  }
  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey || idempotencyKey.length > 200) {
    return { ok: false, message: "Chave de idempotência inválida." };
  }
  return { ok: true, data: { vehicleId, documentKind: kind as VehicleDocumentKind, documentDate: input.documentDate, fileName, mimeType: mimeType as VehicleDocumentMimeType, sizeBytes, reference, note, idempotencyKey } };
}

export function sortVehicleDocuments(documents: VehicleDocument[]): VehicleDocument[] {
  return [...documents].sort((left, right) => {
    const byDate = right.documentDate.localeCompare(left.documentDate);
    if (byDate !== 0) return byDate;
    const byCreated = right.createdAt.localeCompare(left.createdAt);
    if (byCreated !== 0) return byCreated;
    return right.id.localeCompare(left.id);
  });
}
export function vehicleDocumentIdempotencyKey(input: VehicleDocumentInput, sizeBytes: number): string {
  return [
    "vehicle-document",
    input.documentKind.trim().toLowerCase(),
    input.documentDate,
    input.fileName.trim(),
    String(sizeBytes),
  ].join(":");
}

export async function registerVehicleDocumentSafely(
  store: VehicleDocumentStore,
  vehicleId: string,
  input: VehicleDocumentInput,
  bytes: Blob,
  today: string,
): Promise<VehicleDocumentResult<VehicleDocumentRegisterData>> {
  const validation = validateVehicleDocumentInput(input, bytes.size, today, vehicleId);
  if (!validation.ok) return validation;
  const { error: registerError, data: registered } = await store.register(validation.data);
  if (registerError) return { ok: false, message: registerError.message };
  if (!registered) return { ok: false, message: "A VERAH não reservou o local do documento." };
  const { error: uploadError } = await store.upload(registered.storageBucket, registered.storagePath, bytes, registered.mimeType);
  if (uploadError) {
    const alreadyExists = uploadError.statusCode === 409 || /already exists/i.test(uploadError.message ?? "");
    if (!alreadyExists) {
      // Logical removal keeps the historical metadata while hiding the failed
      // document from the app surface (no public URL was ever created).
      await store.remove(registered.documentId);
    }
    return { ok: false, message: uploadError.message ?? "Não foi possível enviar o arquivo para o armazenamento privado." };
  }
  return { ok: true, data: registered };
}
