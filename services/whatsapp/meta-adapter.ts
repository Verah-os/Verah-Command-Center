import {
  canSendToMeta,
  type WhatsAppConfig,
} from "./config.ts";

type SendTextInput = {
  to: string;
  body: string;
};

export type MetaSendResult =
  | { status: "sent"; externalMessageId: string | null }
  | { status: "synthetic"; externalMessageId: null };

export function createMetaWhatsAppAdapter(
  config: WhatsAppConfig,
  fetchImplementation: typeof fetch = fetch,
) {
  return {
    async sendText(input: SendTextInput): Promise<MetaSendResult> {
      if (!canSendToMeta(config)) {
        if (config.syntheticMode) {
          return { status: "synthetic", externalMessageId: null };
        }
        throw new Error("Meta WhatsApp transport is not configured");
      }

      const response = await fetchImplementation(
        `https://graph.facebook.com/${encodeURIComponent(config.apiVersion)}/${encodeURIComponent(config.phoneNumberId)}/messages`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: input.to,
            type: "text",
            text: { preview_url: false, body: input.body },
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`Meta WhatsApp request failed with ${response.status}`);
      }

      const result = (await response.json()) as {
        messages?: Array<{ id?: string }>;
      };
      return {
        status: "sent",
        externalMessageId: result.messages?.[0]?.id ?? null,
      };
    },
  };
}
