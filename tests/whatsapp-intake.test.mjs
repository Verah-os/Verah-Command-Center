import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canReceiveWebhook,
  canSendToMeta,
  readWhatsAppConfig,
} from "../services/whatsapp/config.ts";
import { createMetaWhatsAppAdapter } from "../services/whatsapp/meta-adapter.ts";
import { renderWhatsAppTemplate } from "../services/whatsapp/message-catalog.ts";
import { handleOutboundMessage } from "../services/whatsapp/outbound-handler.ts";
import { parseWhatsAppInboundPayload } from "../services/whatsapp/payload.ts";
import {
  createWhatsAppSignature,
  verifyWhatsAppSignature,
} from "../services/whatsapp/signature.ts";
import {
  handleWhatsAppWebhook,
  verifyWhatsAppWebhookChallenge,
} from "../services/whatsapp/webhook-handler.ts";

const fixture = async (name) =>
  JSON.parse(
    await readFile(
      new URL(`./fixtures/whatsapp/${name}`, import.meta.url),
      "utf8",
    ),
  );

test("X-Hub-Signature-256 validation accepts only the matching body and secret", () => {
  const body = new TextEncoder().encode('{"synthetic":true}');
  const signature = createWhatsAppSignature(body, "synthetic-test-secret");

  assert.equal(
    verifyWhatsAppSignature(body, signature, "synthetic-test-secret"),
    true,
  );
  assert.equal(
    verifyWhatsAppSignature(body, signature, "another-test-secret"),
    false,
  );
  assert.equal(verifyWhatsAppSignature(body, "sha256=invalid", "secret"), false);
  assert.equal(verifyWhatsAppSignature(body, null, "secret"), false);
});

test("parser extracts text and only allowlisted media metadata", async () => {
  const [textMessage] = parseWhatsAppInboundPayload(
    await fixture("inbound-text.json"),
  );
  assert.deepEqual(textMessage, {
    phone: "+5511999990001",
    externalMessageId: "wamid.synthetic.text.1",
    messageType: "text",
    body: "Meu carro não está ligando.",
    providerTimestamp: "2026-07-31T00:00:00.000Z",
    sanitizedMetadata: {},
  });

  const [imageMessage] = parseWhatsAppInboundPayload(
    await fixture("inbound-image.json"),
  );
  assert.deepEqual(imageMessage.sanitizedMetadata, {
    media_id: "synthetic-media-id",
    mime_type: "image/jpeg",
  });
  assert.equal("sha256" in imageMessage.sanitizedMetadata, false);
});

test("webhook rejects invalid signatures before persistence", async () => {
  const body = JSON.stringify(await fixture("inbound-text.json"));
  let persisted = 0;
  const response = await handleWhatsAppWebhook(
    new Request("https://example.test/api/integrations/whatsapp/webhook", {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=".padEnd(71, "0") },
      body,
    }),
    {
      appSecret: "synthetic-test-secret",
      async persistInbound() {
        persisted += 1;
      },
    },
  );

  assert.equal(response.status, 401);
  assert.equal(persisted, 0);
});

test("webhook validates and persists every accepted synthetic message", async () => {
  const body = new TextEncoder().encode(
    JSON.stringify(await fixture("inbound-text.json")),
  );
  const accepted = [];
  const response = await handleWhatsAppWebhook(
    new Request("https://example.test/api/integrations/whatsapp/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": createWhatsAppSignature(
          body,
          "synthetic-test-secret",
        ),
      },
      body,
    }),
    {
      appSecret: "synthetic-test-secret",
      async persistInbound(message) {
        accepted.push(message.externalMessageId);
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(accepted, ["wamid.synthetic.text.1"]);
  assert.deepEqual(await response.json(), { accepted: true, messages: 1 });
});

test("webhook challenge requires the configured token", () => {
  const accepted = verifyWhatsAppWebhookChallenge(
    new Request(
      "https://example.test/webhook?hub.mode=subscribe&hub.verify_token=synthetic-verify-token&hub.challenge=12345",
    ),
    "synthetic-verify-token",
  );
  assert.equal(accepted.status, 200);

  const rejected = verifyWhatsAppWebhookChallenge(
    new Request(
      "https://example.test/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345",
    ),
    "synthetic-verify-token",
  );
  assert.equal(rejected.status, 403);
});

test("outbound endpoint enforces operational roles and queues instead of sending", async () => {
  let queued = 0;
  let queuedBody = null;
  const renderedBody = renderWhatsAppTemplate("intake_acknowledgement", {});
  const request = () =>
    new Request("https://example.test/api/integrations/whatsapp/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: "77777777-7777-4777-8777-777777777777",
        body: renderedBody,
        idempotencyKey: "synthetic-outbound-1",
        templateKey: "intake_acknowledgement",
        variables: {},
        basis: "transactional",
        origin: "human",
      }),
    });

  const denied = await handleOutboundMessage(request(), {
    async getProfile() {
      return { status: "authenticated", profile: { role: "provider" } };
    },
    outboundEnabled: true,
    async queue(input) {
      queued += 1;
      queuedBody = input.body;
    },
  });
  assert.equal(denied.status, 403);
  assert.equal(queued, 0);

  const accepted = await handleOutboundMessage(request(), {
    async getProfile() {
      return { status: "authenticated", profile: { role: "concierge" } };
    },
    outboundEnabled: true,
    async queue(input) {
      queued += 1;
      queuedBody = input.body;
    },
  });
  assert.equal(accepted.status, 202);
  assert.equal(queued, 1);
  assert.equal(queuedBody, renderedBody);
  assert.deepEqual(await accepted.json(), {
    accepted: true,
    delivery: "outbox",
  });
});

test("catalogued outbound rejects divergent bodies, missing variables and sensitive values", async () => {
  const profile = async () => ({ status: "authenticated", profile: { role: "concierge" } });
  let queuedBody = null;
  const send = (payload) => handleOutboundMessage(new Request("https://example.test/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      conversationId: "77777777-7777-4777-8777-777777777777",
      idempotencyKey: "template-gate",
      basis: "transactional",
      origin: "human",
      ...payload,
    }),
  }), {
    getProfile: profile,
    outboundEnabled: true,
    async queue(input) { queuedBody = input.body; },
  });

  assert.equal((await send({ templateKey: "intake_acknowledgement", variables: {}, body: "Texto arbitrário" })).status, 400);
  assert.equal((await send({ templateKey: "information_needed", variables: {}, body: "Qual informação?" })).status, 400);
  assert.equal((await send({ templateKey: "information_needed", variables: { requested_information: "access_token=segredo" }, body: "irrelevante" })).status, 400);

  const variables = { requested_information: "quilometragem atual" };
  const expected = renderWhatsAppTemplate("information_needed", variables);
  assert.equal((await send({ templateKey: "information_needed", variables, body: expected })).status, 202);
  assert.equal(queuedBody, expected);
});

test("outbound kill switch and agent origin cannot bypass enqueue gates", async () => {
  const renderedBody = renderWhatsAppTemplate("intake_acknowledgement", {});
  const request = (origin = "human") => new Request("https://example.test/api/integrations/whatsapp/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      conversationId: "77777777-7777-4777-8777-777777777777",
      body: renderedBody,
      idempotencyKey: `gate-${origin}`,
      templateKey: "intake_acknowledgement",
      variables: {},
      basis: "transactional",
      origin,
    }),
  });
  let queued = 0;
  const profile = async () => ({ status: "authenticated", profile: { role: "concierge" } });
  const killed = await handleOutboundMessage(request(), {
    getProfile: profile,
    outboundEnabled: false,
    async queue() { queued += 1; },
  });
  assert.equal(killed.status, 503);
  const agent = await handleOutboundMessage(request("agent_proposal"), {
    getProfile: profile,
    outboundEnabled: true,
    async queue() { queued += 1; },
  });
  assert.equal(agent.status, 400);
  assert.equal(queued, 0);
});

test("configuration has an explicit safe fallback without Meta credentials", async () => {
  const config = readWhatsAppConfig({
    NODE_ENV: "test",
    WHATSAPP_SYNTHETIC_MODE: "true",
    WHATSAPP_SYNTHETIC_APP_SECRET: "synthetic-secret-long-enough",
    WHATSAPP_SYNTHETIC_VERIFY_TOKEN: "synthetic-token-long-enough",
  });

  assert.equal(canReceiveWebhook(config), true);
  assert.equal(canSendToMeta(config), false);

  const adapter = createMetaWhatsAppAdapter(config, async () => {
    throw new Error("network must not be called in synthetic mode");
  });
  assert.deepEqual(
    await adapter.sendText({ to: "+5511999990001", body: "Teste sintético" }),
    { status: "synthetic", externalMessageId: null },
  );
});
