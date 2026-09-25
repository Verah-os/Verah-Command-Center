# #266 — provider assignment failure diagnostics

Observed: Concierge selected Oficina Confiança (portal active), but assignment showed
only “Não foi possível indicar o prestador.” The screenshot does not establish the
underlying RPC error or prove the provider is eligible for the service.

Repository findings:
- `list_active_service_providers_with_portal` reports the login/profile link only.
- Assignment validates actor ownership, request stage and active provider. The
  eligibility trigger separately enforces context/category/homologation rules.
- The action discarded all errors except a substring match for an existing provider.

Change: translate allowlisted domain errors for assignment and reassignment; give
unknown failures an opaque reference correlated with operation and sanitized code in
server logs. Never put raw SQL messages/details/hints into the UI or logs. Explain
that portal access does not establish service eligibility. Invalidate canonical
`/prestador` pages on success alongside legacy routes.

Validation: actual Server Action regressions cover eligibility denial, owner mismatch,
inactive provider, stale stage, unavailable RPC, unknown error privacy, reassignment,
canonical cache invalidation and authorization before RPC.

No remote DB operations, migration, identity, homologation, RLS or request mutation.
Do not approve a provider or relax eligibility merely to pass the smoke.

After this revision is available in Alpha, the owner may retry “Indicar prestador” once
on existing request `8b565bd9-f025-42b5-bd8c-38bd1f0753c4` with Oficina Confiança. If it
fails, capture the new full message/reference. If it succeeds, inspect that SAME request
in the provider portal. The underlying remote rejection remains unconfirmed until this
new evidence is available; #266 must remain open.
