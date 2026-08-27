# WhatsApp Alpha activation

This runbook activates the existing WhatsApp channel for a controlled Pilot Alpha. It does not create a Meta account, approve templates, deploy production, or send messages by itself.

## External inputs

Provide these values only through the production secret manager. Never commit or paste them in logs:

- `WHATSAPP_META_APP_SECRET`
- `WHATSAPP_META_VERIFY_TOKEN`
- `WHATSAPP_META_ACCESS_TOKEN`
- `WHATSAPP_META_PHONE_NUMBER_ID`
- `WHATSAPP_META_API_VERSION`
- `WHATSAPP_WORKER_SECRET`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WHATSAPP_WEBHOOK_PUBLIC_URL` (`https://<host>/api/integrations/whatsapp/webhook`)

Non-secret controls:

- `WHATSAPP_PRIVATE_MEDIA_BUCKET=service-attachments`
- `WHATSAPP_REQUEST_TIMEOUT_MS=8000` (allowed: 1000–10000)
- `WHATSAPP_SYNTHETIC_MODE=false`
- `WHATSAPP_OUTBOUND_KILL_SWITCH=true` until human GO

## Activation procedure

1. Create and verify the Meta Business/WABA account and acquire the dedicated VERAH number.
2. Configure the public webhook URL and subscribe only to the required WhatsApp events.
3. Insert all secrets above in the deployment secret manager. Keep synthetic mode disabled.
4. Apply the reviewed migrations through the normal human production gate. Do not run migrations from this runbook.
5. Keep both the environment kill switch and `whatsapp_outbound_control` disabled. Run `pnpm whatsapp:readiness`; expected result is `NOT_READY` listing only the two outbound controls.
6. Validate webhook challenge and a correctly signed fixture in a controlled non-production environment. An invalid signature must return 401.
7. Select one consented Alpha customer. Send one inbound message and verify that an unknown number appears only as `pending_identity`, without customer history.
8. Have Concierge bind the channel to the canonical `customer_id`; record explicit consent source when applicable.
9. Enable the database control with `set_whatsapp_outbound_enabled(true, '<human reason>')`, then set `WHATSAPP_OUTBOUND_KILL_SWITCH=false` through the deployment control plane.
10. Run `pnpm whatsapp:readiness` again. Proceed only with `READY` and no unexpected requirement.
11. Queue one allowlisted transactional template with a unique idempotency key. Confirm one outbox record and one sanitized log event.
12. Test one allowlisted private media item, retry, dead-letter and short signed URL. Never use a personal document.
13. Exercise both kill switches. Confirm no new outbound claim or send occurs while inbound/media retention remains safe.

## GO / NO-GO

GO requires all of the following:

- readiness is `READY`;
- Meta/WABA/number and required template approvals are valid;
- controlled customer identity and consent were reviewed by a human;
- webhook signature, replay, media privacy, retry/dead-letter and both kill switches passed;
- Concierge owns the test window and escalation path;
- privacy/commercial policy and production deployment were separately approved.

NO-GO if any readiness item is missing, synthetic mode is enabled, an unknown number can access history, consent provenance is absent for consent-based messaging, logs contain content/phone/secrets, the database or environment kill switch cannot stop outbound, or a severe incident lacks a human owner.

## Rollback

Set `WHATSAPP_OUTBOUND_KILL_SWITCH=true` immediately. Then have an Admin call `set_whatsapp_outbound_enabled(false, '<incident or rollback reason>')`. Preserve outbox, dead-letter and audit history; do not delete evidence while investigating.
