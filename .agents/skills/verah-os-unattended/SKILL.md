---
name: verah-os-unattended
description: Continue exactly one explicitly authorized VERAH delivery cycle with unattended context reconstruction, deterministic GitHub issue selection, an isolated branch, implementation, validation, draft PR, gated review and optional squash merge. Use only when the user explicitly invokes $verah-os-unattended for Verah-os/Verah-Command-Center and the selected issue has codex:authorized, codex:ready and, for merge, codex:auto-merge. Never use for production, remote database operations, real customer messages, payments, ruleset bypass or new scope.
---

# VERAH OS Unattended

Run one issue per cycle. Treat GitHub as the operational queue, the repository
as implementation truth and the existing Control Plane as the canonical model
for work items, runs, events, locks, approvals and budgets. Do not create
parallel persistence or state machines.

## Load the operating context

Read these references before any mutation:

1. [Context reconstruction](references/context-reconstruction.md)
2. [Work selection](references/work-selection.md)
3. [Autonomy policy](references/autonomy-policy.md)
4. [Release policy](references/release-policy.md)
5. [Production policy](references/production-policy.md)
6. [Failure and resume policy](references/failure-policy.md)

Then read the selected issue, current ruleset/check names, newest handoff, every
applicable ADR and affected tests. Use the templates under `assets/` for the
execution report, executive status and handoff.

## Start a cycle

1. Require an explicit `$verah-os-unattended` invocation.
2. Run `pnpm verah:status`, then `pnpm verah:dry-run`.
3. Fail closed when the local kill switch is active, unattended mode is not
   enabled, the repository differs, another issue is in progress, or scope is
   incomplete.
4. Run `pnpm verah:continue` only after those checks. It reserves one issue and
   records a local resumable checkpoint; it never implements or merges by
   itself.
5. Verify the issue has `codex:authorized` and `codex:ready`. Require
   `codex:auto-merge` before any unattended merge.

## Deliver the selected issue

1. Fetch `main` and create the recorded branch from its exact current SHA.
2. Convert acceptance criteria into tests and a bounded implementation plan.
3. Implement only the written scope. Reuse existing Control Plane contracts.
4. Make small coherent commits and preserve unrelated user changes.
5. Use local or ephemeral infrastructure with synthetic data only.
6. Run focused checks, then Node tests, typecheck, lint, build and applicable
   database replay with `--no-seed`, SQL matrices and schema lint.
7. Permit at most two code-correction attempts after completed failed runs.
8. Review the complete diff, secrets, generated artifacts and divergence.
9. Push the isolated branch and open one draft PR.
10. Update the PR description and a sanitized handoff with actual evidence.

## Release gate

Move the PR to Ready and squash merge only when all conditions in the release
policy pass, including the explicit `codex:auto-merge` label. Never weaken a
ruleset or required check. After merge, verify the `main` workflow and Vercel,
delete only the merged delivery branch, close the issue, clear the operational
lock and record the final handoff.

When the auto-merge label is absent, stop at the reviewed draft PR even if all
technical checks pass. A recurring cycle may select the next issue only after
the prior issue is completed and its lock is cleared.

## Permanent prohibitions

Never access or alter production; run remote migrations, remote database push
or remote history repair; re-enable Supabase production deployment; expose
credentials; bypass a ruleset; send real customer messages; execute real
payments; change financial rules without a separate gate; or perform
destructive deletion. Stop and report the exact gate instead.
