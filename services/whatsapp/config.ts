export type WhatsAppConfig = {
  appSecret: string;
  verifyToken: string;
  accessToken: string;
  phoneNumberId: string;
  apiVersion: string;
  syntheticMode: boolean;
  production: boolean;
  outboundKillSwitch: boolean;
  privateMediaBucket: string;
  publicWebhookUrl: string;
  requestTimeoutMs: number;
};

type Environment = Record<string, string | undefined>;

export function readWhatsAppConfig(environment: Environment): WhatsAppConfig {
  const production = environment.NODE_ENV === "production";
  const syntheticMode =
    !production && environment.WHATSAPP_SYNTHETIC_MODE === "true";
  const appSecret =
    environment.WHATSAPP_META_APP_SECRET ??
    (syntheticMode ? environment.WHATSAPP_SYNTHETIC_APP_SECRET : undefined) ??
    "";

  return {
    appSecret,
    verifyToken:
      environment.WHATSAPP_META_VERIFY_TOKEN ??
      (syntheticMode
        ? environment.WHATSAPP_SYNTHETIC_VERIFY_TOKEN
        : undefined) ??
      "",
    accessToken: environment.WHATSAPP_META_ACCESS_TOKEN ?? "",
    phoneNumberId: environment.WHATSAPP_META_PHONE_NUMBER_ID ?? "",
    apiVersion: environment.WHATSAPP_META_API_VERSION ?? "",
    syntheticMode,
    production,
    outboundKillSwitch:
      environment.WHATSAPP_OUTBOUND_KILL_SWITCH !== "false",
    privateMediaBucket: environment.WHATSAPP_PRIVATE_MEDIA_BUCKET ?? "",
    publicWebhookUrl: environment.WHATSAPP_WEBHOOK_PUBLIC_URL ?? "",
    requestTimeoutMs: Number(environment.WHATSAPP_REQUEST_TIMEOUT_MS ?? "8000"),
  };
}

export function canReceiveWebhook(config: WhatsAppConfig) {
  return config.appSecret.length >= 16 && config.verifyToken.length >= 16;
}

export function canSendToMeta(config: WhatsAppConfig) {
  return Boolean(
    config.accessToken && config.phoneNumberId && config.apiVersion,
  );
}

export function canRunWhatsAppWorker(config: WhatsAppConfig) {
  return config.syntheticMode || canSendToMeta(config);
}

export function canQueueWhatsAppOutbound(config: WhatsAppConfig) {
  return !config.outboundKillSwitch && canRunWhatsAppWorker(config);
}

export function readWhatsAppWorkerSecret(environment: Environment) {
  return environment.WHATSAPP_WORKER_SECRET ?? "";
}
