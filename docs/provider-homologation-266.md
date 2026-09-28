# #266 — Prestadores / Homologação

## Repository audit

`20260826150710_provider_homologation_foundation.sql` defines the canonical profile,
12 seeded checklist items, category authorizations, critical block and append-only
events. The existing RPCs are the only mutation path; table writes remain revoked.
`upsert_provider_homologation_profile` initializes the checklist, and
`review_provider_checklist_item` validates available private attachments belonging
to the same provider. This UI preserves each item's required flag.

Both `pilot_approved` and `approved` require a nonempty, verified and unexpired
mandatory checklist in `set_provider_homologation_status`. The database does not
define a predecessor-state transition graph. `provider_is_eligible_for_service`
additionally checks active provider, critical block, profile review expiry and the
exact authorized/unexpired category for `pilot_alpha`; approval alone never assigns
a service. The admin action additionally rejects approval without valid category,
with inactive provider or critical block. These are UI/action checks; eligibility
is rechecked by existing database gates when a service is assigned.

The audit found `require_homologation_admin` used `<> 'admin'`, which does not reject
SQL NULL for a session without a canonical profile. The new repository-only migration
uses `IS DISTINCT FROM`. No remote migration was applied. Deploying this security
fix through the approved migration process is a prerequisite for treating all direct
RPC callers as hardened; the new web entry itself requires a canonical admin profile.

## Minimum physical check after the authorized release

1. Sign in to Command Center as `contato@verah.app` (VERAH Admin). Open
   **Prestadores / Homologação** (`/prestadores`), search **Oficina Confiança**, and
   verify provider `a1e445d2-f9f8-4570-a674-824ae9a469d4` before making a decision.
2. If the profile is absent, use **Iniciar análise** with confirmed real registration,
   address, responsible person and contact. This seeds the canonical requirements.
   Never fabricate evidence or mark requirements optional to advance a smoke test.
3. Review the required checklist with existing available private evidence IDs linked
   to this provider. Missing evidence remains a blocking operational prerequisite;
   this delivery does not introduce an attachment uploader or public evidence URLs.
4. Authorize only the applicable canonical service category, inspect blockers and
   validity, then record the human decision **Aprovado para piloto** when justified.
   Every successful operation reloads authoritative state. On read failure, stop;
   an error does not mean an empty directory/checklist. On mutation failure, reload
   before retrying because the outcome was not confirmed.
5. Sign in as `prestador@verah.app`. Continue only with existing request
   `8b565bd9-f025-42b5-bd8c-38bd1f0753c4`: authorized provider sees it, performs a
   permitted update, Concierge sees the same row, Customer sees the correct projection.
   Homologation does not guarantee assignment: if that row is not yet assigned or
   its context/category prevents eligibility, use the existing authorized Concierge
   product flow or report the precise blocker. Do not change context by SQL or create
   another request/APK. Preserve customer, vehicle and request identifiers throughout.

No identity, customer, vehicle, service request, remote database, production, payment,
real message, secret, signing, publishing or manual deployment action is part of this PR.
Issue #266 stays open pending that same-row physical smoke.
