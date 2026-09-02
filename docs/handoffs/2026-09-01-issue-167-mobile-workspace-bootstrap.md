# Handoff — Issue #167 Mobile workspace bootstrap

- **Issue / PR:** #167 / #168 (Draft)
- **Commit:** `2a1da82`
- **Files changed:** `mobile/.npmrc` (novo), `mobile/pnpm-lock.yaml` (novo), `mobile/package.json`, `mobile/README.md`, `.github/workflows/ci.yml`, `tests/mobile-scaffold.test.mjs`
- **Behavior delivered:** workspace `mobile/` reproduzível a partir de checkout limpo (`pnpm install --frozen-lockfile`), `expo-doctor` 18/18 e job de CI `mobile` adicionado ao gate `required`, sem tocar na CI web/database.
- **Focused tests:** `pnpm test` (raiz) — 240/240 pass; `cd mobile && pnpm run check` — typecheck + expo-doctor OK; `pnpm install --frozen-lockfile` (raiz e mobile) OK; `pnpm lint` e `pnpm build` OK.
- **Required checks:** CI `application`, `database-authorization` inalterados; novo job `mobile` incluído no gate `required`.
- **Invariant/decision discovered:** (1) decisão de workspace registrada no plano: lockfile pnpm **isolado** em `mobile/` (não pnpm workspaces na raiz) + `node-linker=hoisted` scoped em `mobile/.npmrc` — Metro/Expo exige layout hoisted e a CI web permanece byte-idêntica; (2) Expo SDK 53 exige `react-native@0.79.6` (scaffold tinha 0.79.5 — corrigido via expo-doctor); (3) o teste de secrets do scaffold varria `node_modules` e quebrava com falso positivo ("private key" no header de licença do compilador TypeScript) — agora exclui artefatos vendorizados gitignored.
- **Remaining blocker/risk:** nenhum. `pnpm doctor` usa `pnpm dlx expo-doctor@1` (requer rede; saída de sucesso é suprimida quando redirecionada, mas o exit code propaga — verificado com falha forçada).
- **Codex usage:** n/a (OpenHands session).

## Next session
Próxima tarefa ordenada por dependência: **Auth Mobile (M1)** — telas de login/cadastro + sessão Supabase persistida (AsyncStorage) sobre o contrato `user_profiles`/`verah_identities`, usando os comandos documentados em `mobile/README.md`. Não herdar narrativa desta sessão além dos invariantes acima.
