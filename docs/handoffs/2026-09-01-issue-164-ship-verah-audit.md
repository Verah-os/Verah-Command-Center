# Handoff — Issue #164 auditoria SHIP VERAH + scaffold mobile M1

- **Issue / PR:** #164 / (draft PR aberto nesta branch)
- **Commit:** ver HEAD da branch `openhands/164-ship-verah-audit-mobile-scaffold`
- **Files changed:** `docs/ship-verah/audit-release-1.0.md`, `docs/ship-verah/master-plan.md`, `mobile/` (scaffold Expo), `tests/mobile-scaffold.test.mjs`, `tsconfig.json`
- **Behavior delivered:** auditoria evidence-based da Release 1.0 (JÁ EXISTE/PARCIAL/FALTA/FORA DO 1.0), plano mestre M1–M4 com issues ordenadas e scaffold Expo fail-closed sobre o Supabase existente (sem backend paralelo).
- **Focused tests:** `node --experimental-strip-types --test tests/mobile-scaffold.test.mjs` — 6/6; suíte completa `pnpm test` — 232/232.
- **Required checks:** CI remota (application) pendente no PR; nenhuma mudança de SQL/RLS, então `ci:database` não é afetado.
- **Invariant/decision discovered:** a RLS/grants existentes já autorizam cliente mobile direto via anon key + RPCs de onboarding; Server Actions/RSC são web-only e não se portam — o app fala PostgREST/Auth direto.
- **Remaining blocker/risk:** PR #139 (onboarding canônico de veículo) aberto pode ajustar o contrato de garagem; contas Apple/Google e EAS production são HUMAN gates.
- **Codex usage:** n/a.

## Next session
Abrir a issue "Mobile workspace bootstrap" (item 1 de `docs/ship-verah/master-plan.md`): instalar deps de `mobile/`, lockfile, `expo-doctor`, decisão de pnpm workspaces e job de CI.
