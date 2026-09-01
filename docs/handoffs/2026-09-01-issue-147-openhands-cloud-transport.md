# Handoff — #147 OpenHands Cloud transport (executor activation gap)

- **Issue / PR:** #147 / PR #165 a partir de `openhands/147-openhands-cloud-transport`
- **Commit:** (ver branch)
- **Files changed:** `services/control-plane/openhands-cloud-transport.ts`, `services/control-plane/composition.ts`, `tests/control-plane-openhands-cloud.test.mjs`, `docs/runbooks/openhands-cloud-transport.md`, `docs/handoffs/2026-09-01-issue-147-openhands-cloud-transport.md`
- **Behavior delivered:** transporte real OpenHands Cloud (API V1) atrás do contrato `OpenHandsTransport`/`AgentExecutor` existente; readiness com verificação de credencial + capacidade, execução delegada com prompt-contrato, custo/duração capturados, composição de runtime em `composition.ts` que liga `createOpenHandsCloudExecutor` ao router como fallback; artefato verificado via GitHub API (exatamente um Draft PR aberto na branch/lease do repositório alvo — mencionar URL não basta), e cancelamento/timeout termina a conversa remota antes do `sandbox_id` (resolução via start-task id; fallback `DELETE /api/v1/app-conversations/{id}`; log `cancel_unconfirmed` quando impossível). Fail-closed sem flag/credencial/base URL/GitHub token válidos, em produção, sem branch isolada ou sem issueKey parseável.
- **Focused tests:** `node --experimental-strip-types --test tests/control-plane-openhands-cloud.test.mjs` → 16/16 (fallback via composição de runtime, matriz de verificação de Draft PR, cancelamento com e sem sandbox id, composer nulo fail-closed).
- **Required checks:** `pnpm test` 242/242; `pnpm typecheck` 0 erros; `pnpm lint` 0 erros (1 warning preexistente); `pnpm build` sucesso.
- **Invariant/decision discovered:** três lacunas do review do Codex corrigidas sem quebrar contratos (1) ativação por ambiente passa por `createControlPlaneExecutorRouter(process.env, ...)`, o ponto de composição real, não um router só-de-teste; (2) a verificação do artefato exige `GITHUB_TOKEN`/`GH_TOKEN`, caso contrário a config desabilita; (3) terminação remota usa o start-task id retido + endpoint de delete a nível de conversa do app server.
- **Remaining blocker/risk:** invocação real exige ação humana única documentada no runbook (criar `OPENHANDS_CLOUD_API_KEY` e `GITHUB_TOKEN` no secret store do ambiente não-produção); sem isso o caminho permanece desabilitado por fail-closed — nada foi simulado como ativação real.
- **Codex usage:** n/a (sessão OpenHands).

## Next session
Com a key configurada, executar a tarefa piloto do runbook e validar custo/duração reais no relatório operacional (Phase 8).
