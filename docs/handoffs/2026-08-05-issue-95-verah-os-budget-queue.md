# Handoff — Issue #95: VERAH OS Budget Manager & Queue Persistence

- Date: 2026-08-05
- Main/base SHA: `216d2899160a6e1942f06eb16027beedbeb6778a`
- Branch/PR: `feat/95-p0-verah-os-budget-manager-queue-persistence`; draft PR #97
- Scope delivered: atomic single-item dispatcher queue tied to the canonical checkpoint, explicit budget/quota/rate-limit/recovery states, persisted backoff and next attempt, separate invocation/token correction reserve, cache-aware CLI token accounting, continuous lease renewal, branch-before-write recovery, and automatic checkpoint completion after merge
- Architecture decisions: ADR 007 reserves work before evaluating invocation capacity, persists lease/working-state recovery metadata in checkpoint v4 and dispatcher state v3, and keeps dispatcher state as a local projection rather than a second Control Plane
- Validation evidence: focused dispatcher suite 28/28; complete Node suite 96/96; typecheck, lint and Next.js build passed with Node 22.17.1; one pre-existing unused-import lint warning remains
- Automatic correction budget: 2/2 used; the final correction updated legacy workspace test doubles after the new branch gate correctly rejected the dirty operational checkout
- Current locks and labels: Issue #95 retains `codex:authorized`, `codex:ready` and `codex:in-progress`; `codex:auto-merge` is absent
- Deliberate limitations: one host and one queued item; no artificial quota increase, parallel Issues, production action, remote database action or ruleset change
- External credentials/costs: none
- Production and remote migrations: not accessed
- Recommended next action: review draft PR #97 and required CI; preserve the human merge gate. After a future merge, the dispatcher now clears the checkpoint and releases the next authorized Issue automatically.
