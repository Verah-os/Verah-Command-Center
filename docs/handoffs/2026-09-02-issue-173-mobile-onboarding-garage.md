# Handoff — Issue #173 Onboarding + Garagem Mobile (M1)

- **Issue / PR:** #173 / Draft PR na branch `openhands/173-mobile-onboarding-garage`
- **Commit:** ver HEAD da branch
- **Files changed:** `mobile/src/customer-journey.ts` (novo), `mobile/src/CustomerJourney.tsx` (novo), `mobile/src/supabase.ts`, `mobile/src/AuthGate.tsx`, `mobile/App.tsx`, `mobile/tests/customer-journey.test.mjs` (novo), `mobile/README.md`, `docs/handoffs/2026-09-02-issue-173-mobile-onboarding-garage.md`
- **Behavior delivered:** pós-login, o app restaura a jornada via `refresh_customer_onboarding` e roteia para perfil básico → veículo → garagem; cadastro mobile sem identidade chama `start_customer_onboarding` uma única vez (idempotente) com nome derivado do e-mail; perfil básico via `complete_customer_basic_onboarding` com `pilot-alpha-onboarding-v1` e aceite explícito; veículo cadastrado/confirmado via RPC `confirm_customer_vehicle` (proveniência `manual`, `p_customer_confirmed=true`); garagem lê `customer_vehicles` sob RLS owner-based; estados loading/erro(com retry)/sucesso explícitos; fail-closed preservado.
- **Focused tests:** `cd mobile && pnpm run check` — 26/26 (8 auth + 18 jornada) + typecheck + expo-doctor 18/18 OK; raiz `pnpm ci:application` — 273/273 + typecheck + lint + build OK.
- **Required checks:** CI `application`, `mobile`, `database-authorization` inalterados (nenhuma mudança de SQL/RLS; criação de veículo continua RPC-only conforme #139).
- **Invariant/decision discovered:** cadastro de veículo no mobile é **manual-only** — o lookup por fixture local é web-only (Server Action), e a RPC só aceita `manual`/`local_fixture` de `authenticated`; mobile usa `lookup_source='manual'`. `start_customer_onboarding` é chamado somente quando `refresh` falha (identidade inexistente), nunca a cada abertura — evita criar relação customer em identidades não-customer; falha cai em estado de erro fail-closed.
- **Remaining blocker/risk:** nenhum novo. `pnpm doctor` via `pnpm dlx` exige rede (conhecido desde #167). Validação DoD ponta-a-ponta (cliente real concluindo onboarding + garagem persistida) exige projeto Supabase dev com as envs públicas — HUMAN gate de ambiente, fora desta sessão.
- **Codex usage:** n/a (OpenHands session).

## Next session
Próxima fatia ordenada do M1 definida em `docs/ship-verah/master-plan.md` — fora desta branch/PR. Não iniciada por este executor.
