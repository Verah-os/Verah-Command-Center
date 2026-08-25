const EVENT_TYPES = new Set([
  "sla.intake.stalled",
  "sla.delivery.dead_letter",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORBIDDEN_KEYS = /^(authorization|body|email|message|phone|secret|token)$/i;

export type N8nNotificationContractV1 = {
  schema_version: 1;
  event_id: string;
  event_type: "sla.intake.stalled" | "sla.delivery.dead_letter";
  aggregate_type: string;
  aggregate_id: string;
  occurred_at: string;
  data: Record<string, unknown>;
};

export function parseN8nContract(value: unknown): N8nNotificationContractV1 {
  if (!isRecord(value) || value.schema_version !== 1) throw new Error("n8n_contract_version_unsupported");
  if (!UUID.test(String(value.event_id)) || !UUID.test(String(value.aggregate_id))) {
    throw new Error("n8n_contract_invalid_id");
  }
  if (!EVENT_TYPES.has(String(value.event_type))) throw new Error("n8n_contract_invalid_event");
  if (typeof value.aggregate_type !== "string" || !/^[a-z_]{1,40}$/.test(value.aggregate_type)) {
    throw new Error("n8n_contract_invalid_aggregate");
  }
  if (typeof value.occurred_at !== "string" || Number.isNaN(Date.parse(value.occurred_at))) {
    throw new Error("n8n_contract_invalid_timestamp");
  }
  if (!isRecord(value.data) || containsForbiddenKey(value.data)) {
    throw new Error("n8n_contract_unsafe_data");
  }
  return value as N8nNotificationContractV1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function containsForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenKey);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, nested]) => FORBIDDEN_KEYS.test(key) || containsForbiddenKey(nested),
  );
}
