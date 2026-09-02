# Handoff — Issue #169 Auth Mobile (M1)

- **Issue / PR:** #169 / #172 (Draft)
- **Commit:** `36a8cf6`
- **Files changed:** `mobile/src/auth-session.ts` (novo), `mobile/src/supabase.ts`, `mobile/src/AuthGate.tsx` (novo), `mobile/src/AuthScreen.tsx` (novo), `mobile/App.tsx`, `mobile/tests/auth-session.test.mjs` (novo), `mobile/package.json`, `mobile/README.md`
- **Behavior delivered:** cadastro/login de cliente por e-mail+senha no app Expo com sessão Supabase persistida (AsyncStorage) e restaurada na abertura, estados signed-in/signed-out explícitos, sign-out limpando estado local, fail-closed quando a config pública non-prod está ausente.
- **Focused tests:** `cd mobile && pnpm run check` — 8/8 testes de auth/sessão + typecheck + expo-doctor OK; root `pnpm ci:application` — 273/273 + typecheck + lint + build OK.
- **Required checks:** CI `application`, `database-authorization` inalterados; job `mobile` passa a executar `pnpm test && pnpm typecheck && pnpm doctor` via script `check` estendido.
- **Invariant/decision discovered:** estado de sessão desacoplado do React Native via seam `AuthFacade` — máquina de auth 100% testável com `node --test` (mesma convenção da suíte raiz) sem runtime nativo; adapter real Supabase fica em `src/supabase.ts` (`getAuthFacade`).
- **Remaining blocker/risk:** nenhum. `pnpm doctor` via `pnpm dlx` exige rede (comportamento já conhecido do #167).
- **Codex usage:** n/a (OpenHands session).

## Next session
Próxima tarefa ordenada por dependência: **Onboarding + garagem mobile (M1)** — RPCs `start_customer_onboarding`, `complete_customer_basic_onboarding`, `refresh_customer_onboarding` + `customer_vehicles` (RLS) e RPC `confirm_customer_vehicle` (contrato final do #139). Não herdar narrativa desta sessão além do invariante acima.
