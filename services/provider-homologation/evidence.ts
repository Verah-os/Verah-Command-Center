import { createHash } from "node:crypto";
import { requireRole } from "@/services/auth/profile";
import { createSupabaseServerClient } from "@/services/supabase/server";

const bucket = "service-attachments";
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
const mimeTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const failure = () => new Error("Evidência não confirmada. Recarregue e confira o arquivo antes de tentar novamente.");
const checksum = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export type Evidence = {
  id: string;
  status: string;
  created_at: string;
  declared_mime_type: string;
  size_bytes: number;
};

// Session-bound Storage and RPC clients: never service-role credentials.
export async function uploadHomologationEvidence(form: FormData): Promise<string> {
  await requireRole(["admin"]);
  const provider = form.get("provider_id");
  const note = form.get("reason");
  const file = form.get("file");
  if (typeof provider !== "string" || !uuid.test(provider) ||
      typeof note !== "string" || !note.trim() || note.length > 500 ||
      !(file instanceof File) || file.size < 1 || file.size > MAX_EVIDENCE_BYTES ||
      !mimeTypes.includes(file.type)) throw failure();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = checksum(bytes);
  const client = await createSupabaseServerClient();
  const reserved = await client.rpc("reserve_provider_homologation_evidence", {
    p_provider_id: provider, p_mime_type: file.type, p_size_bytes: file.size,
    p_checksum: hash, p_reason: note.trim(),
  });
  const row = reserved.data as { id: string; storage_path: string } | null;
  if (reserved.error || !row || !uuid.test(row.id) ||
      row.storage_path !== `provider-homologation/${provider}/${row.id}`) throw failure();
  try {
    const uploaded = await client.storage.from(bucket).upload(row.storage_path, bytes, {
      contentType: file.type, upsert: false,
    });
    if (uploaded.error || !uploaded.data) throw failure();
    const downloaded = await client.storage.from(bucket).download(row.storage_path);
    if (downloaded.error || !downloaded.data || downloaded.data.size !== file.size ||
        checksum(new Uint8Array(await downloaded.data.arrayBuffer())) !== hash) throw failure();
    const completed = await client.rpc("finish_provider_homologation_evidence", {
      p_provider_id: provider, p_attachment_id: row.id, p_available: true,
    });
    if (completed.error || completed.data !== row.id) throw failure();
    return row.id;
  } catch {
    // Best effort rejection; if this also fails the reservation remains pending,
    // never usable as evidence. Keep the object and audit history for inspection.
    try {
      await client.rpc("finish_provider_homologation_evidence", {
        p_provider_id: provider, p_attachment_id: row.id, p_available: false,
      });
    } catch { /* Remains pending if the session or connection was lost. */ }
    throw failure();
  }
}

export async function readHomologationEvidence(provider: string, id: string): Promise<Blob> {
  await requireRole(["admin"]);
  if (!uuid.test(provider) || !uuid.test(id)) throw failure();
  const client = await createSupabaseServerClient();
  const { data, error } = await client.from("service_attachments")
    .select("storage_bucket,storage_path,visibility,status,homologation_provider_id,size_bytes,checksum_sha256")
    .eq("id", id).eq("homologation_provider_id", provider).single();
  if (error || !data || data.homologation_provider_id !== provider ||
      data.storage_bucket !== bucket || data.visibility !== "operations" || data.status !== "available") throw failure();
  const downloaded = await client.storage.from(bucket).download(data.storage_path);
  if (downloaded.error || !downloaded.data ||
      (data.size_bytes !== null && downloaded.data.size !== data.size_bytes) ||
      (data.checksum_sha256 && checksum(new Uint8Array(await downloaded.data.arrayBuffer())) !== data.checksum_sha256)) throw failure();
  return downloaded.data;
}
