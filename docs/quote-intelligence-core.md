# VERAH Quote Intelligence Core — Alpha

## Purpose

Quote Intelligence recommends the safest and most technically useful path for
obtaining a proposal. It does not determine price, diagnosis, repair, provider
or vehicle safety.

The first catalog contains 59 deterministic rules across:

- preventive maintenance;
- tires and road behavior;
- brakes;
- suspension and steering;
- engine;
- transmission and clutch;
- electrical and electronic systems;
- air conditioning;
- glass;
- collision and body repair;
- detailing;
- emergencies;
- tint, multimedia, reverse camera, audio, parking sensors, tracker, alarm,
  immobilizer, hitch, dashcam and accessibility adaptations.

## Output contract

Each assessment returns:

- quote mode and rule-match confidence;
- required diagnostic confidence and comparison readiness;
- risk and vehicle-movement policy;
- recommended specialty;
- missing questions, evidence, measurements and documents;
- compatibility and commercial scope;
- reason and next action;
- rule and engine versions;
- mandatory human-review marker.

## Labor Intelligence

Each taxonomy entry can store minimum, typical and maximum reference times,
complexity, lift/scanner/special-tool requirements, later alignment,
calibration, curing time, stock dependency, dismantling level, hidden-cost risk
and mobile-service possibility.

These values are operational references. They are not customer promises,
quotes or authorization to add charges. Related services record frequent or
conditional relationships and never make a sale mandatory.

## Classification behavior

The caller sends only normalized codes indicating which data and evidence are
available. Arbitrary customer text and phone numbers are not accepted by this
contract.

Examples:

- `accessory.tint` with confirmed compatibility and complete requirements
  returns `direct_accessory_quote`;
- `suspension.noise` returns `inspection_first` and lists missing evidence;
- `engine.overheating` returns `emergency`, blocks comparison and returns
  `do_not_move`;
- an accessory with unknown compatibility returns
  `compatibility_check_required`;
- an incompatible accessory remains blocked.

Repeated calls with the same idempotency key and input return the same
assessment. Reusing the key with different input fails. The assessment and its
timeline event are created in one database transaction.

## Security model

- Customer: no access to internal tables in this PR.
- Provider: no access to internal tables or competitors.
- Concierge: reads catalog and assessments; can request classification.
- Admin: same operational visibility.
- Service role: narrow server-side RPC access.
- Anon: no access.

A future customer comparison will be a separate sanitized publication. It must
not expose internal notes, provider identity, competing proposals or raw
evidence.

## Local verification

The database CI:

1. starts the official local Supabase stack;
2. replays migrations without seed data;
3. runs authorization and Quote Intelligence SQL tests;
4. runs two concurrent classifications with the same idempotency key;
5. runs schema lint;
6. repeats the complete replay from a clean database.

Application CI runs Node tests, typecheck, lint and the Next.js build.

## Explicit non-goals

This Alpha Core does not:

- alter quote amounts or item calculations;
- assess submitted quote quality;
- compare providers;
- authorize inspection, second opinion or movement;
- publish data to the customer;
- provide investor-demo screens;
- call external AI, n8n or production services.
