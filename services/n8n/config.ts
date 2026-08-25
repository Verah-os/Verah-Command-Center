export type N8nConfig = {
  enabled: boolean;
  webhookUrl: string;
  webhookAuthToken: string;
  workerSecret: string;
  timeoutMs: number;
};

type Environment = Record<string, string | undefined>;

export function readN8nConfig(environment: Environment): N8nConfig {
  return {
    enabled: environment.N8N_NOTIFICATIONS_ENABLED === "true",
    webhookUrl: environment.N8N_DISPATCHER_WEBHOOK_URL ?? "",
    webhookAuthToken: environment.N8N_WEBHOOK_AUTH_TOKEN ?? "",
    workerSecret: environment.N8N_WORKER_SECRET ?? "",
    timeoutMs: 5_000,
  };
}

export function canDispatchN8n(config: N8nConfig) {
  if (config.webhookAuthToken.length < 32) return false;
  try {
    return new URL(config.webhookUrl).protocol === "https:";
  } catch {
    return false;
  }
}
