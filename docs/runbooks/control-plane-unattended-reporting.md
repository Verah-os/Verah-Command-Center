# Runbook — Control Plane Unattended Mode & Operational Report (Phase 8, #147)

Non-production only. Everything below runs dry-run with synthetic GitHub events
and fixture adapters. The kill switch stays on by default; every run here
explicitly releases it inside the harness and never touches production,
credentials, real payments, real messages, remote migrations or the dispatcher.

## What Phase 8 adds

- `services/control-plane/operational-report.ts` — founder/operator-facing
  operational report built from the unattended queue snapshot:
  - totals (completed/blocked/dead-letter/queued/retryable, runs, rework,
    cost in microunits, executor duration);
  - per-executor and per-model breakdowns (runs, rework, cost, duration,
    outcome); rework is attributed from `AgentRun.attempt` (attempt > 1);
  - gate outcomes, including every fail-closed HUMAN block with its reason;
  - per-item outcome: branch, attempts, executors used, handoff delivered,
    Draft PR URL, check status, review-gate result, blocker;
  - explicit source-of-truth statement: GitHub (operational) and Supabase
    (state) remain authoritative; shared agent memory is read-only and
    never a competing source of truth;
  - fixed safety posture declaration.
- `scripts/control-plane-unattended-demo.ts` — end-to-end unattended
  demonstration (`pnpm control-plane:demo`): picks eligible synthetic tasks,
  acquires leases, routes role/model/executor, falls back from an unavailable
  Codex to OpenHands behind the same execution contract, deduplicates repeated
  deliveries, dead-letters a persistent failure after bounded retries, stops
  fail-closed at a HUMAN gate with zero executor side effects, then prints the
  operational report (markdown + JSON). Exits non-zero if any safety violation
  is detected (external effects — including attempts sanitized into the
  `executor_side_effect_contract_violation` blocker — non-dry-run, HUMAN
  execution, shared branch).

## How to run

```bash
pnpm control-plane:demo
node --experimental-strip-types --test tests/control-plane-operational-report.test.mjs
```

## Reading the report

- `killSwitchActive: true` means the queue halted without executing; investigate
  configuration before expecting progress.
- `gates.human` counts items the Control Plane refused to execute; each entry in
  `gates.humanBlockers` names the issue and the reason. These require founder
  action — they never reach an executor.
- `perExecutor[].models[]` records cost/duration per executor+model pair, which
  feeds the cost router policy (`services/control-plane/model-cost-router.ts`).
- `items[].executors` shows which executor actually ran after routing/fallback;
  `policy-executor-router` on a blocked item means no executor was invoked.

## Boundaries (unchanged)

- The Control Plane, not an executor, decides the next task. Executors receive
  one bounded task and stop.
- One Issue belongs to one executor at a time (lease); agents never share a
  branch; every execution starts from updated `main` (enforced by the calling
  workflow, outside this dry-run harness).
- Draft PR remains mandatory; required checks and review gates are never
  bypassed.
