# Handoff — Issue #150 (Langflow + unattended queue)

- **Issue / branch:** #150 / `codex/150-langflow-unattended-queue`
- **Files changed:** `services/control-plane/{executor-router,unattended-queue}.ts`,
  `services/control-plane/{types,foundation}.ts`, flow JSON, testes e runbook.
- **Behavior delivered:** fila dry-run determinística, adapter Langflow fino,
  roteamento disponibilidade/tipo/custo, fallback no mesmo lease,
  idempotência, retries finitos, HUMAN/kill switch e dead-letter/report.
- **Focused tests:** `node --experimental-strip-types --test
  tests/control-plane-unattended-queue.test.mjs
  tests/control-plane-foundation.test.mjs tests/control-plane-openhands.test.mjs`
  — 24/24 aprovados.
- **Required checks:** `pnpm typecheck`, `pnpm lint` e `pnpm build` aprovados;
  somente avisos preexistentes de demo/Edge Runtime.
- **Invariant/decision:** v1 é serial e fail-closed; nenhuma lógica crítica ou
  autorização de produção reside no Langflow.
- **Remaining risk:** importação visual em uma instância real do Langflow ainda
  requer sandbox isolado; a especificação e o piloto atuais são locais.
- **Codex usage:** indisponível.

## Next session

Revisar o parent #147 e o próximo Context Pack explícito; não escolher backlog
automaticamente.
