# Release 1.0 — staging Supabase Advisor audit (#259)

Status: repository-only preparation. **No remote migration was applied by this work.** The already-known non-production migration-application gate remains a Human Gate.

## Invariants preserved

This hardening does not change the canonical VERAH backend contracts for identity, customer/vehicle ownership, `service_request`, mileage, fuel/energy, expenses, maintenance, documents, RLS/auth, payments or outbound messaging. Fuel remains measured in litros (L) and charging in kWh; no conversion between those units is introduced.

## Security Advisor classification

### `anon_security_definer_function_executable`

`public.bind_service_request_customer_identity()` is a trigger-only `SECURITY DEFINER` function. Its canonical implementation already uses `set search_path = ''` and schema-qualified customer lookup. Direct execution by browser roles is unnecessary. The versioned migration `supabase/migrations/20260912131500_staging_advisor_security_hardening.sql` therefore explicitly revokes EXECUTE from `public`, `anon` and `authenticated`. Trigger execution remains intact and canonical customer binding stays fail-closed.

### `function_search_path_mutable`

The four reported functions are trigger/helper functions whose current bodies use PostgreSQL built-ins and row values only:

- `public.set_ai_agent_updated_at()`
- `public.dispatcher_engine_log_entry(text)`
- `public.set_dispatcher_job_updated_at()`
- `public.set_system_setting_updated_at()`

The hardening migration sets each function's `search_path` to `pg_catalog`. No signature, trigger binding, table grant, payload shape or business rule changes.

### `rls_enabled_no_policy`

The following tables are deliberately classified **fail-closed; no permissive policy should be added**:

- `private.work_items`
- `private.execution_runs`
- `private.events`
- `private.locks`
- `private.approvals`
- `private.budgets`

They are private control-plane state. Their foundation migration enables RLS and revokes table access from `public`, `anon`, `authenticated` and `service_role`; access is mediated by tightly scoped `SECURITY DEFINER` routines with server-role checks.

`public.integration_outbox` is also deliberately fail-closed for direct client table access. Its foundation migration enables RLS and revokes direct access from `public`, `anon` and `authenticated`. Worker functions for WhatsApp/n8n use `SECURITY DEFINER`, `set search_path = ''`, explicit server-role checks and narrow EXECUTE grants to `service_role`. Adding a browser-facing RLS policy would weaken the outbound boundary and is intentionally not done.

### `authenticated_security_definer_function_executable`

This finding is not suitable for a mass revoke. VERAH intentionally exposes some authenticated RPCs for customer/concierge/provider journeys while server-only functions are separately revoked from client roles. Classification rule for Release 1.0:

1. **Client journey RPC:** may retain `authenticated` EXECUTE only when the function performs explicit role/ownership checks or relies on canonical RLS/auth boundaries.
2. **Trigger-only function:** no direct browser EXECUTE; revoke client execution.
3. **Server/worker/admin function:** must be fail-closed to browser roles and explicitly validate server/admin authorization.
4. **Unknown:** do not change grants automatically; audit individually before a later versioned migration.

This issue only changes the Advisor findings that can be proven safe from repository evidence. It does not mass-revoke 79 functions and therefore avoids breaking identity, `service_request`, vehicle ownership, money/messages, admin or onboarding flows.

## Performance Advisor classification

The performance findings (foreign keys without covering indexes, multiple permissive policies, and unused indexes) are recorded but not bulk-mutated here. In particular, an unused-index report from an empty/light staging environment is not sufficient evidence for destructive index removal. Any later optimization must be workload-backed, independently reviewed and versioned.

## Validation / rollout boundary

Repository validation should confirm the hardening migration contains the explicit client-role revoke and the four fixed search paths, while this document retains the fail-closed table classification. CI may run normally. Applying this migration to any remote Supabase project is **not part of this PR** and remains behind the existing Human Gate. No production DB change, migration repair, secret access/rotation, real payment/message, signing, store submission or publication is authorized by this artifact.
