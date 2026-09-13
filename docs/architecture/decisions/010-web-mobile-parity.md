# ADR 010 — Web × Mobile parity is a Release 1.0 invariant

Status: accepted
Date: 2026-09-13
Owner: Release 1.0

## Context

VERAH is one multichannel product, not separate Web and Mobile products.
Customers onboard without manual intervention and interact through the Web
(demo control plane) and the React Native / Expo app. Early Release 1.0
milestones implemented several customer-facing capabilities only in one
channel, creating functional divergence.

## Decision

Every customer-facing functionality applicable to both channels must be
implemented and maintained in **both** Web and Mobile, using the **same
canonical backend, domain model, identity, ownership, data and business
rules**. Different UI/UX per platform is allowed and expected. Functional
divergence, duplicated domain logic, separate histories or incompatible data
models are NOT allowed.

A feature is not DONE merely because it works on Mobile or Web. For every
applicable feature the Definition of Done is:

**Backend + Web + Mobile + tests + cross-channel consistency.**

If functionality is legitimately platform-specific (camera, biometrics,
native notifications, OS integrations, etc.), document why instead of
creating an artificial equivalent.

## Consequences

- Web server actions and Mobile controller functions call the same canonical
  Supabase RPCs (`register_vehicle_mileage`, `register_vehicle_fuel`,
  `register_vehicle_charging`, `register_vehicle_maintenance`,
  `register_vehicle_document`, `remove_vehicle_document`,
  `vehicle_expense_summary`, ...) and read the same canonical tables under the
  same RLS.
- Validation bounds are shared in one pure module
  (`lib/customer-vehicle-log-contract.ts`) mirrored by the mobile controller,
  so both channels reject the same inputs before the same RPC.
- Writes that the canonical schema authorizes via direct INSERT under RLS
  (e.g. `vehicle_expenses`) are allowed on Web exactly when the same RLS
  boundary would allow Mobile to do the same for the same customer.
- Common invariants are preserved: canonical backend, auth/identity, customer
  ownership, vehicle ownership, service_request, mileage, fuel/energy with
  correct liters vs kWh semantics, expenses, maintenance, documents, RLS,
  history and existing security boundaries.
- Every future feature/Issue must explicitly classify:
  - Backend: required / not required
  - Web: required / not required
  - Mobile: required / not required
  If Web or Mobile is N/A, a justification is required.

## Definition of Done (multichannel)

A multichannel VERAH feature is DONE only when:

1. canonical backend behavior exists;
2. Web implementation exists when applicable;
3. Mobile implementation exists when applicable;
4. both consume the same canonical data/state;
5. authorization/RLS remains correct;
6. relevant tests pass;
7. cross-channel consistency is validated.

## Reference: Release 1.0 Web × Mobile parity matrix

Status values: `PASS` (functional on both channels against the same
canonical records), `GAP` (missing on at least one channel), `INTENTIONAL
PLATFORM-SPECIFIC` (documented platform-only capability).

| Capability | Backend | Web | Mobile | Cross-channel consistency | Test coverage | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Auth/login | canonical auth | Web login flows (`/login`, `/entrar/*`) | AuthGate + Supabase auth | same Supabase identity | auth-session tests (mobile), web auth tests | PASS |
| Onboarding/profile | canonical RPCs (`start_customer_onboarding`, `complete_customer_basic_onboarding`) | `/onboarding/cliente` | OnboardingStep screens | same RPCs same customer row | identity/onboarding security tests + mobile onboarding tests | PASS |
| Customer identity | canonical `customers` + auth identity | customer gate + RLS | AuthGate + identity inference | same canonical customer | `customer_identity_security` + concurrency tests | PASS |
| Garage | canonical `customer_vehicles` read | `/demo/cliente` + `/demo/cliente/veiculos` | CustomerHome garage carousel | same vehicle rows under RLS | vehicle onboarding security tests | PASS |
| Vehicle creation/edit/deactivation | canonical RPCs (confirm/replace) | on-boarding + vehicle edit form | VehicleOnboardingStep / vehicle edit UI | same canonical vehicles | vehicle onboarding security tests | PASS |
| Vehicle ownership | owner-based RLS on all vehicle tables | owner filter on server reads | owner-scoped facade reads | same RLS boundary | RLS catalog + per-table security tests | PASS |
| Vehicle history | canonical tables + service history | `/demo/cliente/veiculo/[id]` + `/historico` | CustomerJourney + history screens | same canonical rows | vehicle history tests | PASS |
| Mileage/odometer | `register_vehicle_mileage` RPC | `/veiculo/[id]/mileage` (Web) | MileageHistoryScreen + register | same RPC, no odometer regression | `vehicle_mileage_logs_security` + contract tests | PASS |
| Fuel/refueling | `register_vehicle_fuel` RPC | `/veiculo/[id]/fuel` (Web) | FuelHistoryScreen + register | same RPC, liters semantics | `vehicle_fuel_logs_security` + contract tests | PASS |
| EV/hybrid charging/energy | `register_vehicle_charging` RPC | `/veiculo/[id]/fuel` (Web) | ChargingHistoryScreen + register | same RPC, kWh semantics | `vehicle_charging_logs_security` + contract tests | PASS |
| Expenses | `vehicle_expenses` table + `vehicle_expense_summary` RPC + RLS INSERT | `/veiculo/[id]/expenses` (Web) | expense dashboard read (write via maintenance `create_expense`) | same canonical table | `vehicle_expenses_security` + contract tests | PASS |
| Maintenance | `register_vehicle_maintenance` RPC | `/veiculo/[id]/maintenance` (Web) | MaintenanceScreen | same RPC + idempotency key shape | `vehicle_maintenance_security` + contract tests | PASS |
| Maintenance assistance | maintenance records + reminders derivation | maintenance page reminder (Web) | maintenance reminder cards | same records + same reminder derivation | maintenance-assist tests (mobile) + web reminder tests | PASS |
| Documents | `vehicle_documents` + `register_vehicle_document` / `remove_vehicle_document` + private storage | `/veiculo/[id]/documents` (Web) | VehicleDocumentsScreen | same RPCs; private owner-scoped bucket | `vehicle_documents_security` + contract tests | PASS |
| service_request | canonical service request state | `/demo/cliente/novo-atendimento` + history | CustomerRequests + flow | same canonical state | service-request tests | PASS |
| Customer service journey | canonical stages | `/demo/cliente/atendimento/[id]` | CustomerJourney | same stage state machine | service-request/journey tests | PASS |
| Concierge interaction/state | canonical concierge state | `/demo/concierge` | concierge flow in app | same canonical state | concierge lifecycle authorization tests | PASS |
| Provider interaction/state | canonical provider network state | `/demo/prestador` + work orders | provider flow in app | same canonical state | provider homologation + invitation tests | PASS |
| Dashboard/home | canonical home projection | `/demo/cliente` | CustomerHome | same data projection | customer-360 telemetry + home tests | PASS |
| Reminders/next-care (R1) | canonical next-care derivation | nextCareMessages in web home + maintenance reminder | maintenance reminders | same derivation inputs | next-care + maintenance-assist tests | PASS |
| Camera/photos | platform capability | N/A — browser file picker used for document upload | image picker / camera | same `register_vehicle_document` RPC | vehicle-documents tests | INTENTIONAL PLATFORM-SPECIFIC (web uses file upload; mobile uses image picker) |
| Push notifications | n8n notification contracts | N/A (web in-app feedback) | Expo notifications | same backend notification contract | n8n notifications SLA security tests | INTENTIONAL PLATFORM-SPECIFIC (native notifications) |

## Cross-channel regression coverage

- `tests/customer-vehicle-log-contract.test.mjs` (web workspace): validates
  that the exact payload shapes built by the Web server actions are accepted
  by the same bounds the Mobile controller enforces, and that both reject the
  same invalid inputs.
- `mobile/tests/*.test.mjs`: mobile-side tests validating the same canonical
  RPC contracts, bounds and idempotency semantics.
- Security tests under `supabase/tests/*` (run by the database CI gate,
  currently blocked in sandbox because Docker is unavailable) validate RLS
  boundaries for every vehicle-log table.