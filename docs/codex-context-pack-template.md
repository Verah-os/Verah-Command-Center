# CODEX CONTEXT PACK — TEMPLATE

Use this template in the Issue before coding. Keep it short enough to read in one pass.

## Mission
One sentence describing the single verifiable delivery.

## Preconditions
- dependency/PR that must already be merged;
- branch/main state that matters;
- human/credential/production gate, if any.

## Start here
Open only the most likely files/directories (prefer 3–6 entries):
- `path/a`
- `path/b`

Targeted searches, maximum 2–4:
```text
rg -n "symbol|domain-term" relevant/paths
```

## Existing invariants — do not rebuild
- canonical identity/state/contract already present;
- authorization/RLS rule that must remain true;
- existing projection vs source-of-truth boundary;
- provenance/audit/idempotency requirement.

## Implement only
- smallest required behavior;
- fixture/fallback when applicable;
- minimum observability/error handling;
- tests required by acceptance criteria.

## Do not implement
- unrelated refactor;
- next Issue;
- production migration/deploy;
- real credentials/payment/message/provider unless explicitly authorized;
- new framework/dependency when existing primitives suffice.

## Focused tests
1. happy path;
2. failure/degraded path;
3. authorization/isolation when applicable;
4. idempotency/provenance when applicable.

Then run the smallest required final gate from `package.json`/`docs/ci.md`.

## Stop conditions
Stop and report a concrete blocker if implementation requires a new security boundary, destructive action, production gate, major architecture rewrite or unavailable external dependency.

## Definition of Done
- expected behavior exists;
- focused tests green;
- required CI green or exact blocker recorded;
- diff remains issue-scoped;
- PR/commit created;
- short handoff produced.

## Handoff format
Use `docs/handoffs/TEMPLATE.md`. Do not start another Issue in the same session.