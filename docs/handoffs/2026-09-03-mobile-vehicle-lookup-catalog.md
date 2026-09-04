# Mobile vehicle onboarding: plate-first + guided catalog

## Scope

- Replaces the primary long manual vehicle form in mobile onboarding with two entry choices: plate-first lookup or guided catalog.
- Reuses the same fixed brand/model catalog already used by the web customer flow (`data/vehicles.ts`) by mirroring it inside the isolated Expo workspace.
- Keeps the documented non-production plate suggestion (`VRH1A23` -> synthetic Volkswagen Polo fixture) explicit; it is not presented as an official lookup.
- Any other plate falls back to guided brand/model selection while preserving the typed plate.
- Customer confirmation remains mandatory before calling the existing canonical `confirm_customer_vehicle` flow.

## Important limitation

The current connected dev database/mobile RPC contract still requires a plate to persist a canonical vehicle, so the no-plate path lets the customer choose brand/model first but requests the plate before final save. A later backend contract change is required to persist a truly plate-optional vehicle without inventing identifiers.

## Files

- `mobile/src/CustomerJourney.tsx`
- `mobile/src/VehicleOnboardingStep.tsx`
- `mobile/src/vehicle-catalog.ts`
- `mobile/tests/vehicle-catalog.test.mjs`

## Safety

No production changes, secrets, paid/external vehicle provider calls, payments, messages, or destructive database operations. The existing canonical vehicle confirmation RPC remains the persistence boundary.
