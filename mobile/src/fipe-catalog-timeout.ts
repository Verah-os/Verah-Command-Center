// Bounded-FIPE-catalog concern, kept free of React Native / Supabase imports
// so the timeout policy is testable in plain Node CI (#266). The catalog call
// must degrade predictably into manual onboarding instead of hanging the
// first-vehicle step when the external provider stalls.
export const FIPE_CATALOG_TIMEOUT_MS = 10_000;