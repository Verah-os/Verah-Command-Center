# Handoff — Issue #74: Second Opinion & Vehicle Movement

- Date: 2026-08-05
- Main/base SHA: `d8cfd63988b774240ee47a5412f482e3ab63a68e`
- Branch/PR: `feat/74-second-opinion-vehicle-movement`; draft PR #94
- Implementation commit: `adbd0c5`
- Scope delivered: immutable second-opinion eligibility/request/response/result records, conservative human-confirmed vehicle-movement guidance, append-only service timeline events, audience-specific projections, server adapters and tests
- Architecture decisions: ADR 006 binds every case to the latest immutable quote revision and eligibility assessment, restricts outcomes and movement codes to non-diagnostic values, and denies automated critical decisions
- Validation evidence: focused tests 4/4; complete Node suite 88/88; typecheck, lint and Next.js build passed; one pre-existing unused-import lint warning remains; isolated local Supabase validation passed with a full clean replay using `--no-seed`, incremental replay, the complete SQL authorization and concurrency matrix, and schema lint with no errors
- Automatic correction budget: 2/2 used. The implementation now uses deterministic event sequence numbers for same-transaction ordering and unambiguous local provider identifiers in the movement-guidance projection.
- Current locks and labels: Issue #74 retains `codex:authorized`, `codex:ready` and `codex:in-progress` until the remote checks finish; `codex:auto-merge` is absent
- Deliberate limitations: no UI, diagnosis, automatic provider selection, towing/dispatch, external integration, real message, payment or financial change
- External credentials/costs: none
- Production and remote migrations: not accessed
- Recommended next action: require all checks on draft PR #94 plus human review, then decide separately whether it may leave draft; preserve the human merge gate
