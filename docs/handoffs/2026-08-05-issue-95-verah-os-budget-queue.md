# Handoff — Issue #95: VERAH OS Budget Manager & Queue Persistence

- Date: 2026-08-05
- Main/base SHA: `216d2899160a6e1942f06eb16027beedbeb6778a`
- Branch/PR: `feat/95-p0-verah-os-budget-manager-queue-persistence`; draft PR
- Scope delivered: atomic single-item dispatcher queue tied to the canonical checkpoint, explicit budget/quota/rate-limit/resume states, persisted backoff and next attempt, separate invocation/token correction reserve, and cache-aware CLI token accounting
- Architecture decisions: ADR 007 reserves work before evaluating invocation capacity and keeps dispatcher state as a local projection rather than a second Control Plane
- Validation evidence: focused dispatcher suite 23/23; complete Node suite 91/91; typecheck, lint and Next.js build passed; one pre-existing unused-import lint warning remains
- Automatic correction budget: 1/2 used after the first completed focused run exposed cycle accounting for an already-reserved item
- Current locks and labels: Issue #95 retains `codex:authorized`, `codex:ready` and `codex:in-progress`; `codex:auto-merge` is absent
- Deliberate limitations: one host and one queued item; no artificial quota increase, parallel Issues, production action, remote database action or ruleset change
- External credentials/costs: none
- Production and remote migrations: not accessed
- Recommended next action: review the draft PR and required CI; preserve the human merge gate
