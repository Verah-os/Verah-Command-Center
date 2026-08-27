# Identity and onboarding foundation

`auth.users` authenticates a login. `verah_identities` identifies a person inside
VERAH. `user_profiles` keeps the current RBAC access profile, while
`identity_relations` links the same identity to customer/provider/internal
relations without using email or phone as a business key.

## Current login

- Email and password through Supabase Auth is enabled for customer and provider
  account creation.
- Concierge has no public signup; an existing Admin provisions an existing Auth
  user with `provision_concierge_identity`.
- Admin continues to use the existing administrative mechanism only.

## Prepared providers

Google, phone OTP and Facebook may be enabled later as Supabase Auth login
methods. Successful provider linking must retain the existing `identity_id` and
must never merge accounts from matching email/phone text alone. Phone ownership,
OAuth state/PKCE/nonce and reauthentication are external activation gates.

WhatsApp remains a `customer_channels` entry. Unknown numbers remain
`pending_identity`; only the existing human binding flow may attach them to a
canonical `customer_id`.
