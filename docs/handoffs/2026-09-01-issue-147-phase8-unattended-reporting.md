# Handoff — Issue #147 Phase 8 (Unattended Mode + operational report)

- **Issue / PR:** #147 (Phase 8) / draft PR on branch `codex/147-phase8-unattended-reporting`
- **Files changed:** `services/control-plane/operational-report.ts`,
  `scripts/control-plane-unattended-demo.ts`,
  `tests/control-plane-operational-report.test.mjs`,
  `docs/runbooks/control-plane-unattended-reporting.md`, `package.json`
- **Behavior delivered:** operator/founder-facing operational report (totals,
  per-executor/per-model cost/duration/rework, gate outcomes incl. fail-closed
  HUMAN blocks, per-item PR/check/handoff outcome, source-of-truth and safety
  posture statements) plus a runnable end-to-end unattended dry-run demo that
  exits non-zero on any safety violation.
- **Focused tests:** `node --experimental-strip-types --test
  tests/control-plane-operational-report.test.mjs` — 8/8; full suite
  `pnpm test` — all green; `pnpm typecheck` + `pnpm lint` clean.
- **Required checks:** `pnpm control-plane:demo` exits 0 with zero safety
  violations; report confirms dry-run, zero external effects, no shared
  branch, HUMAN gate never executed.
- **Invariant/decision discovered:** the report consumes only the queue
  snapshot — handoff text never leaves the audit trail (report carries
  booleans/refs), so secret-shaped executor output cannot leak into operator
  reports; foundation sanitization already redacts it upstream.
- **Remaining blocker/risk:** leases and queue state are in-memory; a real
  multi-process deployment needs the Supabase-backed lease store (future
  bounded work, not Phase 8 scope). Executors in the demo are fixtures behind
  the real contracts — wiring real Codex/OpenHands transports stays gated and
  out of scope.

## Next session
Verify epic #147 acceptance criteria against merged state; close the epic only
if every criterion is demonstrably satisfied.
