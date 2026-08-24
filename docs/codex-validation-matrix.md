# Codex Validation Matrix

Purpose: choose the smallest meaningful validation first. This is guidance; required CI remains authoritative.

## Current repository commands
From `package.json`:
- `pnpm test` — Node test suite (`tests/*.test.mjs`)
- `pnpm typecheck` — TypeScript no-emit check
- `pnpm lint` — Next lint
- `pnpm build` — production build
- `pnpm ci:application` — test + typecheck + lint + build
- `pnpm ci:database` — database test script

## By change surface
### Documentation only
Start with diff review and markdown/link sanity. Do not run application/database suites unless repository CI requires them.

### UI / demo / customer / concierge
1. run the most relevant targeted Node test file(s), if present;
2. `pnpm typecheck`;
3. `pnpm lint` when TSX/JSX changed;
4. `pnpm build` once near completion;
5. required remote checks once after push.

Avoid repeating build after changes that do not affect compiled code.

### Pure TypeScript domain/lib
1. targeted Node test(s);
2. `pnpm typecheck`;
3. lint if relevant;
4. build only for final/required gate.

### Supabase migration / RLS / SQL function
1. run the closest SQL/security test or focused local database test if the tooling supports it;
2. `pnpm ci:database` once the focused failure passes;
3. application suite only if TypeScript/application contract changed or CI requires it.

Never change a security test merely to match broken implementation; prove the invariant first.

### Integration worker / WhatsApp / n8n
1. targeted integration/unit test;
2. authorization/idempotency/security test;
3. `pnpm ci:database` when SQL changed;
4. `pnpm typecheck`/application checks only for application code touched;
5. no real message or external workflow execution during demo/sprint tasks.

### Auth / identity
1. targeted auth/identity tests;
2. authorization isolation tests;
3. `pnpm typecheck`;
4. `pnpm ci:database` if RLS/schema changed;
5. build once for final gate.

### Payments sandbox
1. unit tests for totals/ledger/idempotency/refund state;
2. authorization tests;
3. `pnpm typecheck`;
4. database tests if schema changed;
5. no real PSP credentials or money movement.

## Expensive-check rule
An unchanged expensive command should not be rerun without a reason. Record the prior green result; rerun after a relevant code change or when the final required gate demands it.

## Failure routing
When CI fails:
1. identify the exact failed job;
2. identify the exact failing assertion/command;
3. reproduce only that failure;
4. determine which predicate/invariant is false;
5. make the smallest fix;
6. rerun focused test;
7. rerun the parent required job once.

Do not restart broad repository exploration because a single check failed.