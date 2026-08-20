# n8n Notifications & SLA runbook

The VERAH backend remains the source of truth. The n8n workflow receives
versioned notification contracts and must never call back to mutate intake,
requests, invitations, quotes, or delivery state.

## Safe defaults

- `N8N_NOTIFICATIONS_ENABLED=false` is the kill switch and the default.
- `N8N_WORKER_SECRET` protects the server-side worker endpoint.
- `N8N_WEBHOOK_AUTH_TOKEN` authenticates delivery to the configured HTTPS webhook.
- Missing or invalid transport configuration returns a no-op status. Intake and
  normal operations continue because notification delivery is out-of-band.
- Enabling a real production workflow or real messages requires a separate human approval.

## Worker

Invoke `POST /api/integrations/n8n/worker` with
`Authorization: Bearer <N8N_WORKER_SECRET>`. Each run:

1. creates idempotent SLA events from canonical backend state;
2. claims only due n8n outbox records;
3. sends contract version `1` with an `Idempotency-Key` header;
4. retries transient failures with bounded exponential delay;
5. moves terminal or exhausted failures to `dead_letter`;
6. returns sanitized counters and the operational backlog report.

Current signals are an intake stalled for 15 minutes and a non-n8n delivery
that reached dead-letter. Payloads contain IDs, timestamps and operational
classifications only—never message bodies, contact details or credentials.

## Recovery

1. Set `N8N_NOTIFICATIONS_ENABLED=false` to stop new claims immediately.
2. Inspect only aggregated worker output: pending, retrying, processing, sent,
   dead-letter and oldest pending timestamp. Logs contain record IDs, attempts
   and normalized error codes only.
3. Correct the external workflow or transport configuration.
4. Review dead-letter records in the backend. Requeueing requires an explicit
   backend operation and human approval; never edit canonical entities in n8n.
5. Re-enable the kill switch and invoke the worker. Existing idempotency keys
   make replay safe at both the backend and receiver boundaries.
