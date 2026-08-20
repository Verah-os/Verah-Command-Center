import { createHash } from "node:crypto";
import type { WhatsAppConfig } from "./config.ts";

export const WHATSAPP_MEDIA_MAX_BYTES = 26_214_400;
export const WHATSAPP_MEDIA_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "audio/mpeg",
  "audio/ogg",
  "application/pdf",
] as const;

export type WhatsAppMediaMimeType =
  (typeof WHATSAPP_MEDIA_MIME_TYPES)[number];

export class WhatsAppWorkerError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(
    code: string,
    retryable: boolean,
  ) {
    super(code);
    this.name = "WhatsAppWorkerError";
    this.code = code;
    this.retryable = retryable;
  }
}

export type DownloadedWhatsAppMedia = {
  bytes: Uint8Array;
  mimeType: WhatsAppMediaMimeType;
  sizeBytes: number;
  checksumSha256: string;
};

export async function downloadWhatsAppMedia(
  input: { externalMediaId: string; declaredMimeType: string | null },
  config: WhatsAppConfig,
  fetchImplementation: typeof fetch = fetch,
): Promise<DownloadedWhatsAppMedia> {
  if (config.syntheticMode) {
    const mimeType = validateMimeType(input.declaredMimeType);
    const bytes = new TextEncoder().encode(
      `synthetic-whatsapp-media:${input.externalMediaId}`,
    );
    return verifiedMedia(bytes, mimeType);
  }
  if (!config.accessToken || !config.apiVersion) {
    throw new WhatsAppWorkerError("transport_unavailable", true);
  }

  const metadataResponse = await fetchImplementation(
    `https://graph.facebook.com/${encodeURIComponent(config.apiVersion)}/${encodeURIComponent(input.externalMediaId)}`,
    { headers: { authorization: `Bearer ${config.accessToken}` } },
  );
  if (!metadataResponse.ok) throw metaHttpError(metadataResponse.status);

  const metadata = (await metadataResponse.json()) as {
    url?: unknown;
    mime_type?: unknown;
    file_size?: unknown;
    sha256?: unknown;
  };
  if (typeof metadata.url !== "string" || !metadata.url.startsWith("https://")) {
    throw new WhatsAppWorkerError("invalid_media_url", false);
  }
  const metadataMime = validateMimeType(metadata.mime_type);
  if (
    input.declaredMimeType &&
    input.declaredMimeType.toLowerCase() !== metadataMime
  ) {
    throw new WhatsAppWorkerError("mime_mismatch", false);
  }
  if (
    typeof metadata.file_size === "number" &&
    metadata.file_size > WHATSAPP_MEDIA_MAX_BYTES
  ) {
    throw new WhatsAppWorkerError("media_too_large", false);
  }

  const mediaResponse = await fetchImplementation(metadata.url, {
    headers: { authorization: `Bearer ${config.accessToken}` },
  });
  if (!mediaResponse.ok) throw metaHttpError(mediaResponse.status);
  const contentLength = Number(mediaResponse.headers.get("content-length"));
  if (
    Number.isFinite(contentLength) &&
    contentLength > WHATSAPP_MEDIA_MAX_BYTES
  ) {
    throw new WhatsAppWorkerError("media_too_large", false);
  }
  const detectedMime = validateMimeType(
    mediaResponse.headers.get("content-type")?.split(";", 1)[0],
  );
  if (detectedMime !== metadataMime) {
    throw new WhatsAppWorkerError("mime_mismatch", false);
  }

  const bytes = new Uint8Array(await mediaResponse.arrayBuffer());
  const verified = verifiedMedia(bytes, detectedMime);
  if (
    typeof metadata.sha256 === "string" &&
    metadata.sha256.toLowerCase() !== verified.checksumSha256
  ) {
    throw new WhatsAppWorkerError("checksum_mismatch", false);
  }
  return verified;
}

export function canSignWhatsAppMedia(input: {
  status: string;
  retentionUntil: string;
  now?: Date;
}) {
  return (
    input.status === "available" &&
    new Date(input.retentionUntil).valueOf() > (input.now ?? new Date()).valueOf()
  );
}

function validateMimeType(value: unknown): WhatsAppMediaMimeType {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  if (
    !WHATSAPP_MEDIA_MIME_TYPES.includes(
      normalized as WhatsAppMediaMimeType,
    )
  ) {
    throw new WhatsAppWorkerError("invalid_media_mime", false);
  }
  return normalized as WhatsAppMediaMimeType;
}

function verifiedMedia(
  bytes: Uint8Array,
  mimeType: WhatsAppMediaMimeType,
): DownloadedWhatsAppMedia {
  if (bytes.byteLength === 0) {
    throw new WhatsAppWorkerError("empty_media", false);
  }
  if (bytes.byteLength > WHATSAPP_MEDIA_MAX_BYTES) {
    throw new WhatsAppWorkerError("media_too_large", false);
  }
  return {
    bytes,
    mimeType,
    sizeBytes: bytes.byteLength,
    checksumSha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function metaHttpError(status: number) {
  return new WhatsAppWorkerError(
    status === 429 ? "meta_rate_limited" : `meta_http_${status}`,
    status === 429 || status >= 500,
  );
}
