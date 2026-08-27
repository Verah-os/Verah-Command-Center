import assert from "node:assert/strict";
import test from "node:test";

import {
  checkWhatsAppReadiness,
  formatWhatsAppReadiness,
} from "../services/whatsapp/readiness.ts";

const readyDatabase = {
  schema_version: 1,
  private_media_bucket: true,
  outbox_contract: true,
  outbound_enabled: true,
  sanitized_observability: true,
};

const productionEnvironment = {
  NODE_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.example.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-that-must-never-print",
  WHATSAPP_META_APP_SECRET: "meta-app-secret-that-must-never-print",
  WHATSAPP_META_VERIFY_TOKEN: "verify-token-that-must-never-print",
  WHATSAPP_META_ACCESS_TOKEN: "access-token-that-must-never-print",
  WHATSAPP_META_PHONE_NUMBER_ID: "phone-number-id",
  WHATSAPP_META_API_VERSION: "v99.0",
  WHATSAPP_WORKER_SECRET: "worker-secret-that-must-never-print",
  WHATSAPP_WEBHOOK_PUBLIC_URL: "https://verah.example/api/integrations/whatsapp/webhook",
  WHATSAPP_PRIVATE_MEDIA_BUCKET: "service-attachments",
  WHATSAPP_REQUEST_TIMEOUT_MS: "8000",
  WHATSAPP_OUTBOUND_KILL_SWITCH: "false",
  WHATSAPP_SYNTHETIC_MODE: "false",
};

test("production without required configuration is NOT_READY and never prints secrets", async () => {
  const result = await checkWhatsAppReadiness({
    NODE_ENV: "production",
    WHATSAPP_META_ACCESS_TOKEN: "do-not-print-this-token",
  }, { async readDatabase() { return null; } });
  assert.equal(result.status, "NOT_READY");
  assert.ok(result.missing.includes("WHATSAPP_META_APP_SECRET"));
  assert.doesNotMatch(formatWhatsAppReadiness(result), /do-not-print-this-token/);
});

test("readiness reports READY only with production contracts and database gates", async () => {
  const result = await checkWhatsAppReadiness(productionEnvironment, {
    async readDatabase() { return readyDatabase; },
  });
  assert.deepEqual(result, { status: "READY", missing: [] });
  const output = formatWhatsAppReadiness(result);
  assert.equal(output, "READY");
  assert.doesNotMatch(output, /secret|token-that|service-role/i);
});

test("synthetic fallback and kill switch keep production NOT_READY", async () => {
  const result = await checkWhatsAppReadiness({
    ...productionEnvironment,
    WHATSAPP_SYNTHETIC_MODE: "true",
    WHATSAPP_OUTBOUND_KILL_SWITCH: "true",
  }, { async readDatabase() { return readyDatabase; } });
  assert.equal(result.status, "NOT_READY");
  assert.ok(result.missing.includes("WHATSAPP_SYNTHETIC_MODE=false"));
  assert.ok(result.missing.includes("WHATSAPP_OUTBOUND_KILL_SWITCH=false"));
});
