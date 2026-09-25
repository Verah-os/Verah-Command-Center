# #275 — automatic journey updates

One client controller at the root activates only on the customer/provider/Concierge
journey lists and UUID detail paths. It checks every eight seconds while visible and
online, and on focus/reconnection. Hidden/offline/pending-render work is paused.

A Server Action validates the current profile, uses only the session-bound Supabase
client, and hashes paginated id/updated_at projections from service_requests and
service_quotes under existing RLS. No rows, fields, service keys or internal details
are returned to the browser. Errors reject rather than returning an empty revision.
No remote publication/subscription/schema setup is required.

Changed revisions merge a fresh server render with router.refresh. Identical revisions
avoid refreshes. One request is in flight per mounted controller, and cleanup ignores
late results. Changed/expired sessions reload the page to re-run route authorization.

Input/change events pause automatic rendering until form reset or navigation; focus in
a form also defers rendering. This intentionally prioritizes unsaved edits over the
10-second target. The pending message explains that the user should save and reopen
if their form does not reset after saving. Network/read errors show stale-data status
and a retry button that keeps the same editing/controller state.

Checks: deterministic controller tests and actual Server Action fixture tests cover
separate session projections, canonical request/quote changes, hidden tabs, editing,
errors, cancellation, overlap suppression and session changes. Existing database CI
remains the RLS gate. Local credential-free fixtures are not a physical Alpha smoke.

Remaining physical #266/#275 smoke: use separate browser profiles for Concierge,
Provider and Customer, keep the same demo request
8b565bd9-f025-42b5-bd8c-38bd1f0753c4 open, and perform its next legitimate synthetic
quote decision/service stage action through the product. Within roughly 8–10 seconds
plus network latency, visible idle tabs should update without F5. Type an unsaved
field in another tab and verify it is preserved while update-pending is shown. No new
request/account/APK or remote data manipulation is needed.
