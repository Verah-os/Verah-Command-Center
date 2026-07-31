import { createHmac, timingSafeEqual } from "node:crypto";

export function createControlPlaneSignature(body: Uint8Array, secret: string) {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

export function verifyControlPlaneSignature(
  body: Uint8Array,
  signature: string | null,
  secret: string,
) {
  if (!signature?.startsWith("sha256=") || secret.length < 32) return false;
  const expected = createControlPlaneSignature(body, secret);
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

