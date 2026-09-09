# Vehicle maintenance — #216

`vehicle_maintenance_records` is the canonical, append-only maintenance history,
linked to the existing customer vehicle and its owner/customer. Authenticated
customers can read their active vehicles' records. The registration RPC validates
the application role and active vehicle ownership; direct client writes and
anonymous/service-role access are revoked. Identity, service requests, mileage
and fuel models are unchanged. Recording historic maintenance does not rewrite
the current odometer or append invented mileage/fuel readings.

## Cost rule

The optional amount is in BRL cents (zero is valid for a free service). Only
explicit `create_expense=true` with a positive amount creates a canonical
`vehicle_expenses` row in the same transaction. Its unique maintenance link
prevents duplicate value on retries. Dashboards continue summing expenses only;
they must never add maintenance amounts a second time. Linked expenses cannot
be changed or deleted through manual expense CRUD. Unlinked manual expenses keep
their existing behavior. For maintenance already entered manually as an expense,
leave the option off; no heuristic matching or automatic duplicate guess occurs.

Retries with the same owner/key and normalized payload return the original IDs.
Reusing a key with a different payload fails. The app uses vehicle/type/date/km
as its stable operation key, including after a connection failure or reopening
the form. A distinct maintenance occurrence needs a distinct date, type or km.
The RPC also accepts caller-supplied keys (maximum 200 characters).

## Reminder rule

The pure derivation receives records, vehicle ID, UTC reference date and the
vehicle's canonical `current_mileage`. Due means date <= reference date **or** km
<= current mileage. Upcoming means within 30 days **or** 1,000 km. Due wins.
Unknown mileage never becomes zero; date reminders still work. No threshold means
no reminder. The most recent record of each trimmed/lowercased type supersedes
older records, ordered by occurrence date, odometer, then ID for ties. A new record
without thresholds clears that type's previous reminder. Other vehicles are
filtered before derivation. There is no scheduler, push or external side effect.

Home and vehicle cards display due/upcoming groups and distinguish failed reads
from empty lists. Returning from mileage/fuel/maintenance refreshes the journey.

## Validation

- `node --experimental-strip-types --test mobile/tests/maintenance.test.mjs`
- `pnpm --dir mobile check` (tests, typecheck, Expo Doctor)
- `pnpm ci:application`
- `pnpm ci:database` (isolated local Supabase only); includes negative maintenance
  authorization/grant tests, input validation, replay and expense invariants in
  both migration replay passes.

No remote migration is authorized by this delivery. Deployment remains subject
to the existing human database gate.
