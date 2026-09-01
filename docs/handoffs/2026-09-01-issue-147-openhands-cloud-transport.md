# Handoff — #147 OpenHands Cloud transport (executor activation gap)

- **Issue / PR:** #147 / PR a partir de `openhands/147-openhands-cloud-transport`
- **Commit:** (ver branch)
- **Files changed:** `services/control-plane/openhands-cloud-transport.ts`, `tests/control-plane-openhands-cloud.test.mjs`, `docs/runbooks/openhands-cloud-transport.md`, `docs/handoffs/2026-09-01-issue-147-openhands-cloud-transport.md`
- **Behavior delivered:** transporte real OpenHands Cloud (API V1) atrás do contrato `OpenHandsTransport`/`AgentExecutor` existente; readiness com verificação de credencial + capacidade, execução delegada com prompt-contrato, custo/duração/PR capturados, cancelamento com pause de sandbox; fail-closed sem flag/credencial/base URL válida, em produção, sem branch isolada ou sem issueKey parseável.
- **Focused tests:** `node --experimental-strip-types --test tests/control-plane-openhands-cloud.test.mjs` → 9/9 (inclui fallback Codex indisponível → OpenHands via `PolicyExecutorRouter` sem copy/paste, e bloqueio fail-closed sem HTTP).
- **Required checks:** `pnpm test` 235/235; `pnpm typecheck` 0 erros; `pnpm lint` 0 erros (1 warning preexistente); `pnpm build` sucesso.
- **Invariant/decision discovered:** o transporte é injetável e o contrato já existia — nenhum arquivo das Fases 1–8 precisou mudar; a ativação real é apenas wiring + config (`createOpenHandsCloudExecutor`), e PR #163 (Phase 8) não se sobrepõe a estes arquivos.
- **Remaining blocker/risk:** invocação real exige ação humana única documentada no runbook (criar `OPENHANDS_CLOUD_API_KEY` no secret store do ambiente não-produção); sem isso o caminho permanece desabilitado por fail-closed — nada foi simulado como ativação real.
- **Codex usage:** n/a (sessão OpenHands).

## Next session
Com a key configurada, executar a tarefa piloto do runbook e validar custo/duração reais no relatório operacional (Phase 8).
