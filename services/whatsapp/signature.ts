import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_PREFIX = "sha256=";

export function createWhatsAppSignature(rawBody: Uint8Array, secret: string) {
  return `${SIGNATURE_PREFIX}${createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex")}`;
}

export function verifyWhatsAppSignature(
  rawBody: Uint8Array,
  signatureHeader: string | null,
  secret: string,
) {
  if (!signatureHeader?.startsWith(SIGNATURE_PREFIX) || !secret) return false;

  const suppliedHex = signatureHeader.slice(SIGNATURE_PREFIX.length);
  if (!/^[0-9a-f]{64}$/i.test(suppliedHex)) return false;

  const expected = Buffer.from(
    createWhatsAppSignature(rawBody, secret).slice(SIGNATURE_PREFIX.length),
    "hex",
  );
  const supplied = Buffer.from(suppliedHex, "hex");

  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}
