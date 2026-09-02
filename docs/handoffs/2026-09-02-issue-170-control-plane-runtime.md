# Handoff — Issue #170 (Non-prod Control Plane runtime entrypoint)

- **Issue / branch:** #170 / `openhands/issue-170-control-plane-runtime`
- **Files changed:** `services/control-plane/runtime.ts` (new),
  `services/control-plane/github-queue.ts` (new),
  `scripts/control-plane-runtime.ts` (new), `scripts/verah-os/policy.ts`
  (additive `selectExecutableIssues`), `package.json`
  (`control-plane:runtime`), `docs/runbooks/control-plane-runtime.md` (new),
  `tests/control-plane-runtime.test.mjs` (new, 8 focused tests).
- **Behavior delivered:** entrypoint real não-prod (`pnpm control-plane:runtime`)
  que compõe a arquitetura #147 existente — intake da fila operacional do
  GitHub (labels `codex:authorized` + `codex:ready`, seções obrigatórias,
  ordenação/lock de `scripts/verah-os/policy.ts`), `UnattendedControlPlaneQueue`,
  leases, gates (squad/review fixtures determinísticos),
  `createControlPlaneExecutorRouter(process.env, ...)` e relatório operacional.
  Bounded: 1 ciclo/1 issue por default, exit 0; fail-closed em produção, flag
  ausente, kill switch ativo, sem token GitHub e sem executor
  (`executor_unavailable`). Uma issue → um executor → uma branch isolada,
  reforçado por dedup em processo + checagem de PR aberto na branch do lease
  (falha na checagem = skip fail-closed).
- **Focused tests:** `node --experimental-strip-types --test
  tests/control-plane-runtime.test.mjs tests/verah-os-core.test.mjs
  tests/control-plane-unattended-queue.test.mjs
  tests/control-plane-openhands-cloud.test.mjs` — 62/62 aprovados.
  CLI fail-closed verificado manualmente (flag/produção/executor ausente).
- **Required checks:** `pnpm test` 273/273, `pnpm typecheck`, `pnpm lint`
  (somente warning preexistente de demo) e `pnpm build` aprovados.
- **Invariant/decision:** elegibilidade NÃO foi redefinida — o runtime consome
  o contrato existente de `scripts/verah-os/policy.ts` (novo export aditivo);
  o dispatcher nunca é importado/invocado (assertado em teste); GitHub segue
  como fonte operacional e o runtime é read-only em labels — após o Draft PR,
  o humano move a issue para `codex:awaiting-review`/remove `codex:ready`.
- **Remaining HUMAN activation:** criar API key OpenHands Cloud + registrar
  `OPENHANDS_CLOUD_API_KEY`/`GITHUB_TOKEN` no secret store do host não-prod,
  liberar `CONTROL_PLANE_KILL_SWITCH=false` deliberadamente e rodar
  `pnpm control-plane:runtime` (ver
  `docs/runbooks/control-plane-runtime.md` e `openhands-cloud-transport.md`).
- **Remaining risk:** sem lock distribuído — rode exatamente uma instância;
  restart re-seleciona issue ainda elegível sem PR aberto (mitigado pela
  checagem de branch, mas labels continuam responsabilidade humana).
- **Next dependency-ordered task:** #169 Auth Mobile (piloto AUTO elegível via
  transporte OpenHands).
