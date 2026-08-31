# VERAH — OpenHands Repository Instructions

OpenHands is a coding executor inside the VERAH engineering system. It does not own product strategy, production authorization, or backlog prioritization.

## Start here
For every task:
1. Read `/AGENTS.md` first and treat it as canonical.
2. Read only the current GitHub Issue and its latest relevant handoff/comment.
3. Use the repository map in Issue #121 when useful.
4. Search for existing contracts/state machines/schemas before creating anything new.
5. Implement the smallest verifiable delivery that satisfies the Issue.

## Execution contract
- Work on exactly one Issue per run.
- Never select the next Issue yourself.
- Start from an updated `main` and create a dedicated branch.
- Never share a branch with Codex or another executor.
- Finish with tests/checks and a Draft PR or a clear blocker handoff.
- Reuse existing architecture; do not create parallel orchestration, identity, state, payment, WhatsApp, Vehicle Intelligence, Knowledge, or auth systems.

## Safety gates
Stop before any side effect involving:
- production deployment or remote migration;
- real credentials/secrets;
- real payment or financial movement;
- real WhatsApp/outbound message;
- destructive data operation;
- critical permissions/RLS change without explicit scope;
- external commercial commitment;
- large architecture rewrite outside the Issue.

These are fail-closed. Report the blocker instead of guessing.

## VERAH invariants
- Customer identity is canonical inside VERAH.
- Approval is not payment; preserve explicit customer authorization for scope/price changes.
- Customer tracking is a projection of canonical service state, not a second state machine.
- Vehicle/provider/knowledge evidence requires provenance.
- AI may assist triage/explanation/evidence organization but must not autonomously diagnose, authorize spend, approve repair, or close safety incidents.
- Provider ranking/margins are internal operational information.
- Custody/leva-e-traz requires explicit evidence, authorization and incident handling.

## Testing and economy
- Targeted search before broad exploration.
- Focused test first; type/lint/build only as justified by the change and required CI.
- Do not rerun expensive unchanged suites.
- Do not fix unrelated lint/refactors.
- Keep logs free of tokens, secrets, cookies and PII.

## Handoff
End with only:
- Issue/PR + commit;
- files changed;
- focused tests + required checks;
- key invariant/decision;
- remaining blocker/risk;
- duration/cost when OpenHands exposes it.

Do not start another Issue after the handoff.
