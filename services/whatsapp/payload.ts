export const WHATSAPP_WEBHOOK_MAX_BYTES = 1_048_576;

export type ParsedInboundMessage = {
  phone: string;
  externalMessageId: string;
  messageType:
    | "text"
    | "image"
    | "video"
    | "audio"
    | "document"
    | "interactive";
  body: string | null;
  providerTimestamp: string | null;
  sanitizedMetadata: Record<string, string>;
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object"
    ? (value as UnknownRecord)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseTimestamp(value: unknown) {
  const raw = asString(value);
  if (!raw || !/^\d{1,12}$/.test(raw)) return null;
  const date = new Date(Number(raw) * 1000);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function parseMessage(messageValue: unknown): ParsedInboundMessage | null {
  const message = asRecord(messageValue);
  if (!message) return null;

  const phone = asString(message.from);
  const externalMessageId = asString(message.id);
  const type = asString(message.type);
  if (!phone || !externalMessageId || !type) return null;

  if (type === "text") {
    const text = asRecord(message.text);
    const body = asString(text?.body);
    if (!body) return null;
    return {
      phone: phone.startsWith("+") ? phone : `+${phone}`,
      externalMessageId,
      messageType: "text",
      body,
      providerTimestamp: parseTimestamp(message.timestamp),
      sanitizedMetadata: {},
    };
  }

  if (
    type !== "image" &&
    type !== "video" &&
    type !== "audio" &&
    type !== "document" &&
    type !== "interactive"
  ) {
    return null;
  }

  const content = asRecord(message[type]);
  const metadata: Record<string, string> = {};
  const mediaId = asString(content?.id);
  const mimeType = asString(content?.mime_type);
  const filename = type === "document" ? asString(content?.filename) : null;
  if (mediaId) metadata.media_id = mediaId;
  if (mimeType) metadata.mime_type = mimeType;
  if (filename) metadata.filename = filename.slice(0, 255);

  return {
    phone: phone.startsWith("+") ? phone : `+${phone}`,
    externalMessageId,
    messageType: type,
    body: null,
    providerTimestamp: parseTimestamp(message.timestamp),
    sanitizedMetadata: metadata,
  };
}

export function parseWhatsAppInboundPayload(
  payload: unknown,
): ParsedInboundMessage[] {
  const root = asRecord(payload);
  if (root?.object !== "whatsapp_business_account") return [];

  const messages: ParsedInboundMessage[] = [];
  for (const entryValue of asArray(root.entry)) {
    const entry = asRecord(entryValue);
    for (const changeValue of asArray(entry?.changes)) {
      const change = asRecord(changeValue);
      if (change?.field !== "messages") continue;
      const value = asRecord(change.value);
      for (const messageValue of asArray(value?.messages)) {
        const parsed = parseMessage(messageValue);
        if (parsed) messages.push(parsed);
      }
    }
  }
  return messages;
}
