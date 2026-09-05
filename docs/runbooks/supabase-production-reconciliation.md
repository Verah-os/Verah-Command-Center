# VERAH Supabase production reconciliation

Status: **NO-GO for production mutations**  
Scope: Issue #83  
Last read-only production inspection: 2026-09-05

## Purpose

This runbook defines a forward-only, auditable path to reconcile the VERAH repository migration history with the current Supabase production database without blindly replaying migrations or rewriting production history.

The objective is to make the production schema, authorization model and migration baseline explainable and reproducible before the end-to-end pilot release (#84).

## Hard safety boundary

The following actions remain blocked until a separate explicit Human Gate is approved:

- `supabase db push` or equivalent remote schema mutation;
- `supabase migration repair` or direct writes to migration history;
- mutable SQL against production, including DDL, DML, GRANT/REVOKE and policy/function changes;
- production backup/restore or any destructive database operation;
- creation of a paid Supabase development branch or other action with incremental cost;
- production Auth configuration changes;
- real messages, payments, secrets/credentials or external irreversible actions.

Read-only catalog inspection and repository-only documentation/code preparation are allowed under the authorization recorded in #83.

## Production snapshot observed on 2026-09-05

Project reference: `henpygvqntvlugdteyry`  
Region: `sa-east-1`  
Project health: `ACTIVE_HEALTHY`  
PostgreSQL major version: 17

No customer rows or other personal-data contents were read during the audit. Inspection was limited to catalog metadata, migration metadata and Supabase advisors.

## Migration-history finding

Production `supabase_migrations.schema_migrations` records only 13 versions, while the repository contains dozens of versioned migration files.

The production history includes semantic equivalents whose version identifiers differ from the repository history. Examples include:

| Capability | Production migration version | Repository migration version |
| --- | --- | --- |
| Customer identity foundation | `20260903234922` | `20260730150101` |
| Secure customer identity | `20260903235239` | `20260730153004` |
| Identity onboarding foundation | `20260903235301` | `20260827013000` |
| Service request pickup location | `20260904211901` | `20260904022000` |
| Canonical service-request customer identity | `20260905000808` | `20260905001000` |

This proves that migration history alone cannot be used as a reliable indication of which repository migrations should be replayed.

### Prohibited reconciliation shortcuts

Do not:

1. replay every repository migration that is absent from remote history;
2. mark migrations as applied solely because names look similar;
3. use `migration repair` to make histories visually match before comparing actual objects;
4. infer safety from migration timestamps;
5. delete or modify older migration files to force convergence.

## Current authorization posture

All inspected `public` tables have RLS enabled. This is a positive baseline, but RLS and table grants are separate controls and both must be reconciled.

Supabase Security Advisor reports RLS enabled with no policies on these legacy tables:

- `concierges`
- `identity_access_events`
- `notifications`
- `providers`
- `ratings`
- `service_photos`

With RLS enabled and no policies, normal RLS-enforced clients are fail-closed. Their intended future state must still be classified explicitly: retained internal-only table, deprecated legacy table, or table needing scoped policies.

### Grants

Several older `public` tables retain broad table privileges for `anon` and/or `authenticated`. RLS continues to restrict row access, but least-privilege table grants must be made explicit before pilot release.

The reconciliation must account for Supabase's 2026 move toward explicit Data API grants. Do not rely on historical default grants as application authorization.

### SECURITY DEFINER functions

Security Advisor reports multiple externally executable `SECURITY DEFINER` functions. They must be classified one by one as either:

- intentionally callable public RPC with explicit authorization checks;
- authenticated RPC whose execution grant should be narrowed;
- internal helper/trigger that should not be directly executable through the Data API;
- candidate for `SECURITY INVOKER` where privilege elevation is unnecessary.

Important observations from the read-only inspection:

- `confirm_customer_vehicle(...)` is `SECURITY DEFINER` and currently has `anon` EXECUTE, but its function body rejects a null `auth.uid()` and requires canonical role `customer`. Anonymous calls therefore fail closed. The `anon` grant is still broader than necessary and should be removed in the eventual hardening migration unless a documented requirement proves otherwise.
- `bind_service_request_customer_identity()` is a trigger function with `SECURITY DEFINER` and a fixed empty `search_path`. Direct `anon`/`authenticated` EXECUTE grants are unnecessary for normal trigger invocation and should be candidates for revocation.
- operational RPCs such as provider assignment, quote actions, completion, priority and dispatcher controls must be checked for role/ownership authorization before their grants are retained.

Security Advisor also flagged mutable `search_path` on:

- `set_dispatcher_job_updated_at`
- `set_ai_agent_updated_at`
- `dispatcher_engine_log_entry`
- `set_system_setting_updated_at`

These should receive an explicit safe `search_path` in the forward reconciliation migration if the functions remain in use.

### Auth

Leaked-password protection is currently disabled. Enabling it is a production Auth configuration change and therefore remains a Human Gate, but it is a pre-pilot security recommendation.

## Reconciliation model

Reconciliation is object-based, not timestamp-based.

Every repository migration/capability must be classified into one of these states:

- **REFLECTED** — the intended final object/state already exists in production and matches current repository expectations;
- **PARTIALLY_REFLECTED** — part of the capability exists but schema, policy, grant, function or constraint details differ;
- **MISSING** — intended state is absent from production;
- **SUPERSEDED** — an older migration's effect has been replaced by a later canonical design and must not be replayed independently;
- **LEGACY_PRODUCTION_ONLY** — production contains an object not represented by the current canonical repository model;
- **REVIEW_REQUIRED** — equivalence cannot be proven safely from metadata alone.

The manifest must compare at least:

1. schemas and tables;
2. columns, defaults and nullability;
3. primary/unique/foreign-key/check constraints;
4. indexes;
5. RLS enablement and policy expressions;
6. grants for `anon`, `authenticated`, service roles and relevant internal roles;
7. functions/RPC signatures, security mode, owner, `search_path` and execution grants;
8. triggers;
9. Storage buckets/policies if used by the pilot;
10. Auth configuration relevant to login/onboarding.

## Canonical VERAH invariants to preserve

Any reconciliation plan is invalid if it breaks these product/domain invariants:

- `service_request` remains the canonical shared service lifecycle across customer, Concierge and Provider surfaces;
- Customer, Concierge, Provider and Admin remain role-isolated;
- a Provider can only see and mutate work authorized for that Provider;
- provider identity is abstracted from the customer by default except when legal, fiscal or warranty disclosure requires it;
- Leva & Traz remains mandatory in core service journeys;
- the customer sees one final VERAH price;
- financial values are governed by Admin; Concierge cannot change governed values;
- production customer identity remains canonical and bound to the authenticated user rather than phone number or other weak identifiers.

## Safe staged procedure

### Phase 1 — completed: read-only production inventory

Evidence collected:

- project health/version metadata;
- remote migration-history list;
- RLS enablement inventory;
- policy inventory;
- role-table-grant inventory;
- Security Advisor snapshot;
- Performance Advisor snapshot;
- targeted definitions for high-risk `SECURITY DEFINER` functions.

No production mutation occurred.

### Phase 2 — repository reconciliation manifest

Create a deterministic manifest mapping repository migrations/capabilities to current production objects using the classification above.

Prioritize canonical pilot-path capabilities first:

1. identity/auth/profile;
2. customer vehicle/onboarding;
3. canonical `service_requests`;
4. Concierge lifecycle;
5. Provider assignment, isolation and portal operations;
6. quote lifecycle and final VERAH customer price;
7. completion/rating/history;
8. custody/Leva & Traz;
9. WhatsApp/notification support only where part of the approved pilot.

No remote writes are needed for this phase.

### Phase 3 — isolated restore and replay test — HUMAN GATE

Before any production mutation:

1. obtain an approved logical backup/snapshot strategy;
2. restore that backup to an isolated environment with no real outbound integrations;
3. if a Supabase development branch is used, obtain explicit cost authorization first;
4. verify that backup restoration is complete and queryable;
5. reproduce the production schema baseline in isolation;
6. apply only a newly designed forward reconciliation migration, not the historical backlog wholesale;
7. run synthetic tests by role and compare object manifests before/after.

No production data should be copied into environments that are not approved to hold it. Prefer sanitized/synthetic verification wherever possible.

### Phase 4 — forward-only reconciliation migration

After the object manifest and isolated test prove the desired state, produce one or more narrowly-scoped forward migrations that:

- preserve already-correct production objects;
- add only genuinely missing canonical objects;
- alter only proven divergent objects;
- explicitly harden grants and RPC execution rights;
- retain necessary RLS semantics;
- fix mutable `search_path` where applicable;
- add only justified covering indexes;
- do not remove indexes solely because an advisor currently reports them unused;
- include reversible or compensating rollback steps where technically possible.

Migration-history normalization, if still necessary, is treated as a separate decision from schema reconciliation.

### Phase 5 — synthetic role matrix

Before production approval, test at minimum:

| Actor | Required evidence |
| --- | --- |
| Customer | sees only own identity/vehicle/request/history; can create allowed requests and customer decisions only |
| Concierge | sees and operates allowed assigned/operational requests; cannot change Admin-governed financial values |
| Provider | sees only Provider-authorized requests; quote/completion actions cannot escape Provider scope |
| Admin | can perform explicitly authorized operational/governance actions without weakening customer/provider isolation |
| Anonymous | cannot invoke privileged RPCs, enumerate protected records or mutate domain state |

Include negative/BOLA tests, not only happy paths.

### Phase 6 — advisors and smoke tests

Run Security Advisor after the isolated reconciliation. Any remaining `SECURITY DEFINER`, RLS or grant warning must have an explicit documented disposition: fixed, accepted with justification, or pilot-blocking.

Performance Advisor findings are reviewed separately. Security correctness takes priority over optimization.

### Phase 7 — production go/no-go — HUMAN GATE

Production mutation requires a new explicit authorization after the exact migration, backup evidence, isolated test results and rollback steps are available for review.

The production change window must define:

- exact migration(s) and hashes;
- operator/responsible party;
- backup/snapshot identifier and restore evidence;
- expected locks and execution time class;
- stop conditions;
- rollback/compensating procedure;
- post-change role smoke tests;
- monitoring window;
- explicit go/no-go decision.

## Stop conditions

Immediately stop reconciliation if any of these occur:

- production object cannot be mapped confidently to a repository capability;
- an intended migration would drop or overwrite data;
- an authorization rule cannot be proven with negative tests;
- Provider isolation or customer ownership becomes ambiguous;
- a migration would alter customer-visible price/governance semantics;
- backup restoration is unverified;
- isolated replay produces an unexplained schema diff;
- secrets, payment credentials or real outbound messaging become necessary;
- a paid resource is required without explicit cost authorization.

## Current go/no-go

**NO-GO** for production migration, migration-history repair, grant/RLS/RPC mutation, Auth changes or backup/restore execution.

**GO** for repository-only manifest construction, review of migration SQL, creation of synthetic tests and preparation of an isolated reconciliation package.

## Completion criteria for #83 preparation phase

The preparation portion of #83 is ready for its next Human Gate only when:

- every pilot-critical production object is classified against the repository;
- historical migration divergence is explained rather than hidden;
- a forward-only reconciliation migration proposal exists;
- security warnings have explicit dispositions;
- backup/restore procedure and retention are documented;
- isolated restore/reconciliation tests are defined;
- Customer/Concierge/Provider/Admin and anonymous negative tests are defined;
- rollback and production stop conditions are objective;
- no production mutation has occurred during preparation.
