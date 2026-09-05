# VERAH Supabase reconciliation manifest

Status: initial read-only manifest  
Related: #83  
Production snapshot date: 2026-09-05

This document is an evidence-driven companion to `supabase-production-reconciliation.md`. It does **not** authorize production changes and does not claim historical migration equivalence where only final-state evidence has been observed.

## Classification vocabulary

- **REFLECTED** — current production final state observed and consistent with the current canonical capability at the level inspected.
- **PARTIALLY_REFLECTED** — capability exists, but at least one schema/security/history detail requires reconciliation.
- **MISSING** — intended canonical production object/state was proven absent.
- **SUPERSEDED** — older repository history must not be replayed independently because a newer canonical design exists.
- **LEGACY_PRODUCTION_ONLY** — production object exists but is not part of the canonical pilot path and requires disposition.
- **REVIEW_REQUIRED** — current evidence is insufficient for safe equivalence.

## Migration-history baseline

Remote migration history contains 13 records and is not numerically aligned with the repository's migration directory. Therefore the `Migration history` column below is descriptive only; it is not an instruction to repair or replay history.

## Pilot-critical manifest

| Capability | Production evidence | Repository evidence | Classification | Required next proof |
| --- | --- | --- | --- | --- |
| Canonical customer identity | `customers`, `customer_channels`, `verah_identities`, `identity_onboarding`, `identity_relations` present with RLS; customer/operations read policies observed | identity foundation/security/onboarding migrations exist | **PARTIALLY_REFLECTED** | Compare columns, constraints, all RPC definitions/grants and ownership against current migration intent |
| Customer profile/auth role | `user_profiles` present with RLS and own-profile SELECT policy | canonical auth/profile support exists in application and migrations | **PARTIALLY_REFLECTED** | Verify role constraint/domain, provider binding, admin/concierge semantics and function authorization |
| Customer vehicles | `customer_vehicles` present; RLS; own read/insert/update policies observed | vehicle/onboarding migrations exist | **PARTIALLY_REFLECTED** | Compare full columns/constraints; verify plate uniqueness/normalization and RPC grants |
| Vehicle confirmation RPC | `confirm_customer_vehicle(...)` present, `SECURITY DEFINER`, fixed empty `search_path`, checks `auth.uid()` + role `customer`; `anon` EXECUTE still granted | mobile vehicle confirmation capability exists | **PARTIALLY_REFLECTED** | Remove unnecessary anon execution in isolated hardening test; prove customer-only behavior with negative tests |
| Canonical service request | `service_requests` present; RLS enabled; authenticated customer INSERT and role-scoped SELECT observed | canonical service-request migrations and application services exist | **PARTIALLY_REFLECTED** | Compare complete  column/constraint/index set and all lifecycle RPCs; validate customer/provider/concierge/admin negative matrix |
| Canonical customer binding on service request | Trigger function `bind_service_request_customer_identity()` present; fixed empty `search_path`; canonicalizes customer from `created_by`; broad EXECUTE grant observed | `20260905001000_canonical_service_request_customer_identity.sql` exists; remote history records semantic equivalent under different timestamp | **PARTIALLY_REFLECTED** | Verify trigger attachment; revoke unnecessary direct EXECUTE in isolated hardening test; do not repair history by timestamp alone |
| Pickup / Leva & Traz location | Remote history includes semantic pickup-location migration; `service_requests` current schema includes the newer lifecycle object | `20260904022000_service_request_pickup_location.sql` exists | **PARTIALLY_REFLECTED** | Compare exact pickup columns/constraints and confirm mandatory core journey behavior in app/domain tests |
| Concierge lifecycle | Concierge/service-request operational RPCs exist; service-request role policy observed | concierge acceptance/lifecycle migrations and web surface exist | **PARTIALLY_REFLECTED** | Inspect RPC bodies/grants and prove Concierge cannot cross assignment/financial governance boundaries |
| Provider directory | `service_providers` present with RLS and authenticated active-provider read policy | service-provider and homologation migrations exist | **PARTIALLY_REFLECTED** | Compare homologation fields, provider visibility rules and whether broad legacy `providers` table is still used |
| Provider portal binding | `user_profiles.provider_id` FK exists; performance advisor notes it lacks covering index | canonical `/prestador` portal and provider binding logic on main | **PARTIALLY_REFLECTED** | Verify provider-role/profile binding functions and negative isolation tests |
| Provider assignment/reassignment | `assign_provider_to_service_request` and `reassign_provider_to_service_request` exist as authenticated `SECURITY DEFINER` RPCs | provider assignment/reassignment migrations exist | **REVIEW_REQUIRED** | Inspect exact function bodies, role checks and provider scope before retaining EXECUTE grants |
| Provider completion | `provider_mark_service_completed` exists as authenticated `SECURITY DEFINER` RPC | complete service journey/provider actions exist | **REVIEW_REQUIRED** | Inspect body and prove provider can complete only own assigned request |
| Quotes | `service_quotes` and `service_quote_items` present; RLS; role-scoped SELECT policies observed | quote core/quality/comparison migrations exist | **PARTIALLY_REFLECTED** | Compare schema/integrity rules and inspect save/submit/approval RPC authorization |
| Customer quote decision | `approve_service_quote` and `request_quote_clarification` exist as authenticated `SECURITY DEFINER` RPCs | quote lifecycle present | **REVIEW_REQUIRED** | Verify request ownership + state gates and that customer sees canonical final VERAH price only |
| Admin financial governance | Production RPC/schema evidence not yet fully mapped in read-only audit | product rule requires Admin-governed values; application logic exists | **REVIEW_REQUIRED** | Map financial columns/functions/grants and prove Concierge cannot alter governed values |
| Service completion confirmation | `concierge_confirm_service_completion` exists as authenticated `SECURITY DEFINER` RPC | complete service journey exists | **REVIEW_REQUIRED** | Verify role/assignment/state checks and final history consistency |
| Rating | legacy `ratings` table has RLS enabled but no policy; `submit_service_rating` RPC exists | rating/history flow exists | **PARTIALLY_REFLECTED** | Determine canonical storage path; inspect RPC authorization; classify legacy table as retained/deprecated |
| WhatsApp consent | `set_whatsapp_consent` exists as authenticated `SECURITY DEFINER` RPC; customer identity/channel tables present | WhatsApp readiness migrations exist | **REVIEW_REQUIRED** | Verify which roles may change consent and whether RPC should remain directly executable |
| Dispatcher runtime | `dispatcher_jobs`, `ai_agents`, `system_settings` exist; broad legacy grants; several dispatcher SECURITY DEFINER warnings; mutable search paths flagged | multiple dispatcher migrations exist | **PARTIALLY_REFLECTED** | Separate pilot-required runtime from legacy/control-plane-only objects; harden internal RPC execution grants |
| Notifications | `notifications` exists with RLS enabled but no policy and broad legacy grants | notification/SLA migrations exist | **REVIEW_REQUIRED** | Determine if table is pilot path, internal-only or superseded; define least-privilege policy/grants if retained |
| Service photos | `service_photos` exists with RLS enabled but no policy and broad legacy grants | media/communication capabilities exist | **REVIEW_REQUIRED** | Determine canonical media path/storage policy; do not expose until ownership rules are explicit |
| Legacy `service_orders` path | table present with own/concierge policies; overlaps with newer `service_requests` architecture | repository contains early service-order migrations plus later canonical service-request system | **SUPERSEDED candidate** | Prove no current pilot-critical application path requires `service_orders`; do not drop or replay until dependency scan is complete |
| Legacy `profiles` / `vehicles` | legacy tables remain with RLS policies and broad grants while canonical `user_profiles` / `customer_vehicles` also exist | repository contains both early and newer identity/vehicle generations | **SUPERSEDED candidate** | Dependency scan of app/RPC/triggers; classify data migration/retention requirements before any deprecation |
| Legacy `providers` | table present, RLS enabled, no policies, broad grants; canonical `service_providers` also present | newer service-provider/homologation model exists | **SUPERSEDED candidate** | Prove current code/RPC dependencies; define retained/deprecated disposition |

## Security hardening manifest

| Finding | Current state | Pilot disposition |
| --- | --- | --- |
| RLS on exposed `public` tables | Enabled on every inspected public table | **Keep**; verify policy coverage intentionally per canonical table |
| Six tables with RLS/no policy | Fail-closed for ordinary RLS clients | **Review** retained vs deprecated vs scoped-policy need |
| Broad legacy table grants | Present on multiple old tables for `anon`/`authenticated` | **Harden before pilot** through explicit least-privilege grants in isolated reconciliation |
| `anon` EXECUTE on `confirm_customer_vehicle` | Function internally rejects null `auth.uid()` and non-customer role | **Harden** grant despite fail-closed body |
| Direct EXECUTE on trigger function `bind_service_request_customer_identity` | Broad grant present; trigger body itself is safely search-path pinned | **Revoke candidate** in isolated reconciliation |
| Authenticated SECURITY DEFINER operational RPCs | Multiple advisor warnings | **Classify individually**; retain only with explicit role/ownership/state validation |
| Mutable function `search_path` | Four functions flagged | **Fix if retained** with explicit safe path |
| Leaked-password protection | Disabled | **Enable recommendation**, but production Auth change requires separate Human Gate |

## Performance manifest

Performance findings are not authorization to change schema. Current observations:

- multiple foreign keys lack covering indexes;
- several RLS policies overlap permissively for the same role/action;
- multiple indexes currently show zero use.

Rules:

1. add an index only where query/constraint workload justifies it;
2. never drop an index solely because the advisor snapshot calls it unused;
3. do not merge permissive policies unless equivalent authorization can be proven with negative tests;
4. security correctness outranks query-plan cleanup during reconciliation.

## Next repository-only checks

Before the isolated-environment Human Gate, safe preparation may continue by inspecting repository SQL and application references for these highest-risk objects:

1. `service_orders`, `profiles`, `vehicles`, `providers` — prove whether they are legacy/superseded or still dependencies;
2. provider assignment/reassignment/completion RPCs — map authorization guards;
3. quote save/submit/approve/clarification RPCs — map role/ownership/price-governance guards;
4. dispatcher SECURITY DEFINER RPCs — classify internal-only vs exposed API;
5. six RLS/no-policy tables — determine retained vs deprecated target state;
6. all broad `anon` grants — build explicit least-privilege target matrix.

No production mutation is required to perform these repository-only checks.
