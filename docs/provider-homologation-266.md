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
The same pending migration adds an admin-only `initialize_provider_homologation_checklist`
wrapper for profiles already created by operational onboarding. It locks the profile
and calls the existing canonical initializer with unchanged values, seeding missing
requirements idempotently without overwriting operational fields. This action requires
that migration to be released by the authorized process; until then RPC failure is explicit.

## Minimum physical check after the authorized release

1. Sign in to Command Center as `contato@verah.app` (VERAH Admin). Open
   **Prestadores / Homologação** (`/prestadores`), search **Oficina Confiança**, and
   verify provider `a1e445d2-f9f8-4570-a674-824ae9a469d4` before making a decision.
2. If the profile is absent, use **Iniciar análise** with confirmed real registration,
   address, responsible person and contact. This seeds the canonical requirements.
   Never fabricate evidence or mark requirements optional to advance a smoke test.
   For an existing profile with no checklist, use **Inicializar checklist** instead;
   its operational fields are preserved atomically.
3. Under **Checklist e evidências**, choose a legitimate file (PDF/JPEG/PNG/WebP,
   at most 10 MiB), describe its origin, and click **Anexar evidência privada**.
   Wait for **Arquivo privado confirmado**, then **Abrir evidência privada**.
   Only after examining the content, select that evidence in the corresponding
   requirement and click **Registrar revisão** with a human justification.
   Upload does not verify requirements or approve the provider. If the organization
   is synthetic and legitimate required documents do not exist, stop: this upload
   feature does not make fabricated documents acceptable or bypass `pilot_alpha`.
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

## Evidence upload extension (repository-only, pending release)

`20260929235916_provider_homologation_evidence_upload.sql` reuses
`service_attachments.homologation_provider_id`, the private `service-attachments`
bucket and `provider_homologation_events`. No second evidence model or request is
created. The generated path binds provider and attachment IDs; the reservation has
no conversation/message/request parent and is always operations-only. The file name
is not placed in the storage path; MIME, byte size, SHA-256 and provenance are recorded.

Two Admin-only, session-bound RPCs reserve `pending` and finalize `available` or
`rejected`. Storage INSERT requires a matching pending reservation by the same
Admin. No overwrite/delete grant is added. Completion verifies the private bucket,
object owner, MIME and size; the application also downloads and checks bytes/hash
before completion. An ambiguous failure leaves pending or rejected metadata and
preserves the audit trail; retry creates a fresh reservation, never overwrites.
Only Admin can read homologation attachments (including through Storage RLS).
Download uses an authenticated no-store route, not a public or signed bearer URL.
Read failure returns an explicit 503, never empty data or a successful download.
Checklist review, status approval and pilot eligibility now recheck physical private
object existence and provider ownership, including after a previously valid object
becomes unavailable. Every review remains an explicit human action.

Release prerequisite: the new migration and its preceding Admin guard must be
applied through the separately authorized migration process and the UI released.
This task does neither remote migration nor deployment. Until then the upload fails
closed; merging code alone does not mean the Alpha UI supports the flow yet.

Audit baseline: `main` `f5a1210db7df32c07c30cd4bd6209d1324f9e15a`, #278/#279 merged,
no open PR duplicating upload at the start of implementation. #278 review resolved.
Preserve provider `a1e445d2-f9f8-4570-a674-824ae9a469d4`, request
`8b565bd9-f025-42b5-bd8c-38bd1f0753c4`, identities and `wxnklnbntgpcncajzpsj`.

## Session recovery after submitting an old Admin tab

Browser tabs in the same profile share the login session. Signing in as Provider or
Customer can invalidate the Admin role of an already-open homologation form. Use
separate browser profiles for simultaneous role testing, or switch sequentially and
sign in as Admin again before reviewing providers.

A denied Server Action now terminates at middleware with an action-protocol redirect;
it must never be replayed as a POST to `/login` or reach the homologation RPC. Plain
HTML POSTs use a 303 redirect so the login page receives GET. Regression tests run the
installed Next response decoder against the middleware result and preserve the old
HTML-response failure as a reproduction case.

After any ambiguous browser error, sign in again and read the same provider before
resubmitting. Synthetic registration data is not evidence for a real homologation;
required checklist evidence and human authorization remain unchanged.
