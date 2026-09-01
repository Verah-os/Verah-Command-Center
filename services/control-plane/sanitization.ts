const sensitiveKey = /authorization|cookie|password|secret|signature|token|credential|phone|email/i;
const secretValue = /(gh[pousr]_[A-Za-z0-9]{20,}|sb_secret_[A-Za-z0-9_-]{20,}|-----BEGIN [^-]*PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/g;
const emailValue = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const phoneValue = /(?<!\d)\+?[1-9]\d{9,14}(?!\d)/g;
const bearerValue = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;

export function sanitizeText(value: string, maxLength = 4_000) {
  return value
    .replace(bearerValue, "Bearer [redacted-secret]")
    .replace(secretValue, "[redacted-secret]")
    .replace(emailValue, "[redacted-email]")
    .replace(phoneValue, "[redacted-phone]")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, maxLength);
}
export function sanitizePayload(
  value: unknown,
  depth = 0,
): unknown {
  if (depth > 4) return "[truncated]";
  if (typeof value === "string") return sanitizeText(value, 2_000);
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizePayload(item, depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 50)
        .map(([key, item]) => [
          key,
          sensitiveKey.test(key) ? "[redacted]" : sanitizePayload(item, depth + 1),
        ]),
    );
  }
  return "[unsupported]";
}
