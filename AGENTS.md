# VERAH — Agent Operating Rules

Purpose: ship the smallest correct change without relearning the repository on every task.

## Start here
For every issue/PR:
1. Read the issue Context Pack and latest related handoff/comment.
2. Use the repository map in Issue #121.
3. Run 2–4 targeted searches (`rg`) before opening broad directories.
4. Reuse existing contracts/state machines/schemas; do not create parallel architecture.
5. Implement one verifiable delivery per session.

## Exploration budget
Default budget before editing: at most 4 targeted searches and 8 relevant files. If more is genuinely required, state the concrete ambiguity first. Never scan the whole repository just to understand VERAH.

## Product boundaries
- Customer identity is canonical inside VERAH; auth providers are login methods, not domain identity.
- Approval is not payment. Preserve explicit customer authorization for scope/price changes.
- Customer-facing tracking is a projection of the canonical service state, not a second state machine.
- Vehicle/provider/knowledge data requires provenance; conflicting evidence is escalated, not silently resolved.
- AI assists triage, explanation and evidence organization; it does not autonomously diagnose, authorize spend, approve repairs or close safety incidents.
- The provider network is operational supply; do not expose internal ranking/margins unnecessarily to customers.
- Leva-e-traz is part of the VERAH value proposition. Custody flows require explicit evidence, authorization and incident handling; never weaken those controls to simplify implementation.

## Demo rules
Demo/sandbox/fixture data must never be represented as production reality. Prefer deterministic fixtures and shared scenario data. No real payment, message, migration, credential, provider or production side effect from a demo task.

## Database and security
For RLS/authorization changes, find the closest existing database authorization test first and implement the smallest delta. Preserve append-only/audit invariants where already established. Never run remote migrations unless the task explicitly passes the human/production gate.

## Testing
Use: focused test -> focused type/lint check -> required CI gate. Do not rerun an unchanged expensive suite repeatedly. Full build/suite is for the final required gate or when the change surface justifies it.

## Token discipline
- Do not use the dispatcher.
- Do not research competitors during coding tasks.
- Do not rewrite strategic documentation unless required by acceptance criteria.
- Do not start the next issue in the same session.
- Do not refactor unrelated code.
- Prefer search/symbol lookup over opening large files.
- Treat open issues as hypotheses: verify whether later PRs already implemented the requirement before coding.

## Stop conditions
Stop and report instead of guessing when the task requires: production deployment/migration, real credentials, real payments/messages, external commercial commitment, destructive data action, unresolved security boundary, or a large architectural rewrite not present in scope.

## Handoff
Finish with only:
- issue/PR + commit;
- files changed;
- focused tests + required checks;
- key decision/invariant discovered;
- remaining blocker/risk;
- Codex usage before -> after when available.

Do not produce a long narrative handoff.