import { readWhatsAppConfig } from "./config.ts";

type Environment = Record<string, string | undefined>;

export type WhatsAppDatabaseReadiness = {
  schema_version: number;
  private_media_bucket: boolean;
  outbox_contract: boolean;
  outbound_enabled: boolean;
  sanitized_observability: boolean;
};

export type WhatsAppReadinessResult = {
  status: "READY" | "NOT_READY";
  missing: string[];
};

export async function checkWhatsAppReadiness(
  environment: Environment,
  dependencies: { readDatabase(): Promise<WhatsAppDatabaseReadiness | null> },
): Promise<WhatsAppReadinessResult> {
  const missing = new Set<string>();
  const config = readWhatsAppConfig(environment);

  requireSecret(environment, "WHATSAPP_META_APP_SECRET", 16, missing);
  requireSecret(environment, "WHATSAPP_META_VERIFY_TOKEN", 16, missing);
  requireSecret(environment, "WHATSAPP_META_ACCESS_TOKEN", 16, missing);
  requireSecret(environment, "WHATSAPP_META_PHONE_NUMBER_ID", 1, missing);
  requireSecret(environment, "WHATSAPP_META_API_VERSION", 1, missing);
  requireSecret(environment, "WHATSAPP_WORKER_SECRET", 24, missing);
  requireSecret(environment, "NEXT_PUBLIC_SUPABASE_URL", 1, missing);
  requireSecret(environment, "SUPABASE_SERVICE_ROLE_KEY", 16, missing);

  if (!config.production) missing.add("NODE_ENV=production");
  if (environment.WHATSAPP_SYNTHETIC_MODE === "true") missing.add("WHATSAPP_SYNTHETIC_MODE=false");
  if (environment.WHATSAPP_OUTBOUND_KILL_SWITCH !== "false") missing.add("WHATSAPP_OUTBOUND_KILL_SWITCH=false");
  if (config.privateMediaBucket !== "service-attachments") missing.add("WHATSAPP_PRIVATE_MEDIA_BUCKET=service-attachments");
  if (!validWebhook(config.publicWebhookUrl)) missing.add("WHATSAPP_WEBHOOK_PUBLIC_URL");
  if (!Number.isInteger(config.requestTimeoutMs) || config.requestTimeoutMs < 1000 || config.requestTimeoutMs > 10000) {
    missing.add("WHATSAPP_REQUEST_TIMEOUT_MS=1000..10000");
  }

  let database: WhatsAppDatabaseReadiness | null = null;
  try { database = await dependencies.readDatabase(); } catch { database = null; }
  if (!database || database.schema_version !== 1) missing.add("DATABASE_SCHEMA_VERSION=1");
  if (!database?.private_media_bucket) missing.add("PRIVATE_MEDIA_STORAGE");
  if (!database?.outbox_contract) missing.add("WHATSAPP_OUTBOX_CONTRACT");
  if (!database?.outbound_enabled) missing.add("DATABASE_OUTBOUND_CONTROL=enabled");
  if (!database?.sanitized_observability) missing.add("SANITIZED_OBSERVABILITY");

  return { status: missing.size === 0 ? "READY" : "NOT_READY", missing: [...missing].sort() };
}

export function formatWhatsAppReadiness(result: WhatsAppReadinessResult) {
  return [result.status, ...result.missing.map((name) => `- ${name}`)].join("\n");
}

function requireSecret(environment: Environment, name: string, minimum: number, missing: Set<string>) {
  if ((environment[name] ?? "").length < minimum) missing.add(name);
}

function validWebhook(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.pathname === "/api/integrations/whatsapp/webhook";
  } catch { return false; }
}
