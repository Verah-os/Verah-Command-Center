import { createSupabaseServerClient } from "@/services/supabase/server";
import { createSupabaseServerStorageClient } from "@/services/supabase/storage";

export const VEHICLE_DOCUMENT_KINDS = [
  "nota_fiscal",
  "garantia",
  "manual",
  "laudo",
  "seguro",
  "licenciamento",
  "outro",
] as const;

const VEHICLE_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const MAX_VEHICLE_DOCUMENT_BYTES = 10 * 1024 * 1024;

export type RegisterVehicleDocumentParams = {
  vehicleId: string;
  documentKind: string;
  documentDate: string;
  reference: string | null;
  note: string | null;
  file: File;
  accessToken: string;
};

export type VehicleDocumentRegisterResult =
  | { ok: true }
  | { ok: false; message: string };

function fileNameSafe(name: string): string {
  return name.trim().replace(/[\\/:*?"<>|]/g, "_").slice(0, 150);
}

// Mirrors mobile registerVehicleDocumentSafely: register metadata via the
// canonical security-definer RPC, then upload the private storage object to the
// exact path the RPC reserved. Logical removal keeps history on upload failure.
export async function registerVehicleDocumentSafely(
  input: RegisterVehicleDocumentParams,
): Promise<VehicleDocumentRegisterResult> {
  const kind = input.documentKind.trim().toLowerCase();
  if (!(VEHICLE_DOCUMENT_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, message: "Selecione um tipo de documento válido." };
  }
  const mimeType = input.file.type.toLowerCase();
  if (!(VEHICLE_DOCUMENT_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return { ok: false, message: "Tipo de arquivo não suportado. Use PDF, JPEG, PNG ou WebP." };
  }
  if (input.file.size < 1 || input.file.size > MAX_VEHICLE_DOCUMENT_BYTES) {
    return { ok: false, message: "O arquivo deve ter entre 1 byte e 10 MiB." };
  }
  const note = input.note?.trim() || null;
  if (note && note.length > 160) {
    return { ok: false, message: "Observação muito longa (limite de 160 caracteres." };
  }
  const reference = input.reference?.trim() || null;
  if (reference && reference.length > 80) {
    return { ok: false, message: "Referência muito longa (limite de 80 caracteres." };
  }
  const fileBase = fileNameSafe(input.file.name);
  if (!fileBase) {
    return { ok: false, message: "Informe o nome do arquivo (até 255 caracteres." };
  }
  const idempotencyKey = [
    "vehicle-document",
    kind,
    input.documentDate,
    fileBase,
    String(input.file.size),
  ].join(":");
  if (idempotencyKey.length > 200) {
    return { ok: false, message: "O nome do arquivo é muito longo. Renomeie o arquivo com um nome mais curto e tente novamente." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("register_vehicle_document", {
    p_vehicle_id: input.vehicleId,
    p_document_kind: kind,
    p_document_date: input.documentDate,
    p_file_name: fileBase,
    p_mime_type: mimeType,
    p_size_bytes: input.file.size,
    p_idempotency_key: idempotencyKey,
    p_reference: reference,
    p_note: note,
  });
  if (error) return { ok: false, message: error.message };
  if (!data) return { ok: false, message: "A VERAH não reservou o local do documento." };

  const registered = data as { document_id: string; storage_path: string };
  const storage = createSupabaseServerStorageClient(input.accessToken);
  const { error: uploadError } = await storage
    .from("vehicle-documents")
    .upload(registered.storage_path, input.file, { contentType: mimeType });
  if (uploadError) {
    const rawStatus = (uploadError as unknown as { statusCode?: unknown }).statusCode;
    const statusCode = typeof rawStatus === "number" ? rawStatus : undefined;
    const alreadyExists = statusCode === 409 || /already exists/i.test(uploadError.message ?? "");
    if (!alreadyExists) {
      await supabase.rpc("remove_vehicle_document", { p_document_id: registered.document_id });
    }
    return { ok: false, message: uploadError.message ?? "Não foi possível enviar o arquivo para o armazenamento privado." };
  }
  return { ok: true };
}