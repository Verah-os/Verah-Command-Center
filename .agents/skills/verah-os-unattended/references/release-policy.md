# Release policy

Require all of the following immediately before unattended squash merge:

- issue remains open, authorized and labeled `codex:auto-merge`;
- PR is open, Ready, mergeable and reports `CLEAN`;
- branch is zero commits behind `main`;
- no unresolved review thread or requested change;
- secret scan and complete diff review have zero findings;
- `CI / Application`, `CI / Database authorization`, `CI / Required` and
  `Vercel` are successful;
- Supabase Preview is skipped or successful without production deployment;
- PR description and handoff state actual limitations and migration status;
- no production, financial, remote database or customer-message gate exists.

Use squash merge. Never bypass the ruleset. After merge, validate the `main`
workflow and Vercel before closing the issue and selecting another one.
