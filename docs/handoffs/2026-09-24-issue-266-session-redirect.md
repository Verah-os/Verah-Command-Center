# #266 — role/session redirect recovery

Cause: `roleHome.provider` points to `/prestador`, but middleware only recognized
`/demo/prestador` as provider-scoped. A valid provider therefore redirected to its
own home with `error=access_denied`. Middleware also redirected authenticated login
requests away from the form, preventing recovery/account switching. `requireRole`
used guarded role homes as denial destinations.

Fix: recognize canonical, legacy and onboarding portal paths with segment boundaries;
keep login GET/POST reachable; terminate all authorization denials at login; preserve
refreshed cookies on middleware redirects. Login clears only the current local session
before new credentials and invalidates protected layout caches. A signout error stops
the switch. Canonical `user_profiles` remains the authority; no metadata role fallback,
profile writes, identity changes, migrations or RLS changes.

Tests: `tests/auth-session-266.test.mjs` executes the actual middleware, guards and
Server Actions against in-memory Auth/profile fixtures, including Concierge -> Provider,
wrong roles, canonical provider home, failed credentials/signout, invalid profiles,
GET/POST recovery and refreshed cookies. Existing application and DB CI remain gates.

## Minimal physical smoke (after the merged revision is available in Alpha)

1. In the same browser with the Concierge session, open `/prestador`.
   Expect the provider login with an access-denied explanation, without a redirect loop.
2. Sign in as `prestador@verah.app` with its existing password. Expect `/prestador`.
   Reload once: the portal must remain open, with no `ERR_TOO_MANY_REDIRECTS`.
3. Open the already-authorized request `8b565bd9-f025-42b5-bd8c-38bd1f0753c4`
   if listed for Oficina Confiança, and confirm the existing vehicle/request context.
   If absent or explicitly denied, report that result; do not recreate or assign anything
   merely to pass this smoke. Portal login and request visibility are separate gates.

No new APK, account, workshop, request or cookie deletion is required. Preserve provider
UID `62e9b86d-1bf7-45e5-b050-0cbff4463978`. No deployment or remote Supabase operation is
part of this change. #266 remains open for the same-row end-to-end acceptance.
