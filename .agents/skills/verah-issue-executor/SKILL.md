---
name: verah-issue-executor
description: Execute exactly one bounded VERAH GitHub Issue or PR fix with minimal repository exploration and token usage. Use when the user explicitly asks Codex to implement/fix one issue in Verah-os/Verah-Command-Center. Do not use the dispatcher, production, real credentials, real payments/messages, remote migrations or unrelated backlog work.
---

# VERAH Issue Executor

Execute one delivery only. Optimize for smallest correct diff and smallest necessary context.

## Inputs
Required:
- one Issue or PR number;
- its Context Pack, when present;
- latest relevant handoff/comment;
- root `AGENTS.md`.

Do not reconstruct VERAH from conversation history or read the entire backlog.

## Route before reading
1. Read the Issue/PR and its latest relevant handoff.
2. Use Issue #121 Repository Map to select likely paths.
3. Run at most 2–4 targeted `rg` searches.
4. Open only the files/symbols returned, normally <=8 files before first edit.
5. Verify that later merged PRs have not already implemented the requirement.

If architecture remains ambiguous after this, state the exact ambiguity before broadening exploration.

## Implement
- preserve canonical identity/state/authorization/provenance contracts;
- reuse existing primitives and tests;
- implement only acceptance criteria;
- do not start the next Issue;
- do not refactor unrelated code;
- prefer deterministic fixture/fallback for demo tasks;
- never convert fixture/sandbox behavior into a production claim.

## Validate efficiently
Follow `docs/codex-validation-matrix.md`:
1. reproduce/run the focused test first;
2. make the smallest fix;
3. rerun the focused test;
4. run only relevant type/lint/database checks;
5. run the required final CI gate once after the diff is stable.

Do not repeatedly run an unchanged expensive suite.

## Stop gates
Stop instead of guessing for production changes, real secrets, real payment/message execution, destructive data actions, unresolved security boundary, external commercial commitment or a major architecture rewrite outside scope.

## Finish
Create/push the issue-scoped branch/PR as permitted by repository rules. Use `docs/handoffs/TEMPLATE.md` and report only the compact handoff. Include Codex usage before -> after when available.

Never invoke or depend on the dispatcher.