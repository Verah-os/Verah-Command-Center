# Auditoria do runtime — por que a fila não avançava sozinha (#179)

- Data: 2026-09-03
- Ambiente: sandbox não-prod do executor OpenHands (delegado pelo Control Plane)
- Fonte canônica: `services/control-plane/`, `scripts/control-plane-runtime.ts`,
  `scripts/verah-os/policy.ts`, runbook `docs/runbooks/control-plane-runtime.md`

## Veredicto

O defeito que matava o avanço recorrente era a **falta de confinamento por
ciclo de falhas do fetch da fila**: `runCycle` aguardava
`fetchOperationalQueue` sem tratamento de erro; um único 5xx/time-out do
GitHub abortava `run()` e o loop unattended morria em vez de seguir para o
próximo ciclo. O fix mínimo desta branch envolve o fetch em try/catch: falha →
log sanitizado `control_plane_queue_fetch_failed`, seleção pulada naquele
ciclo (fail-closed) e `queueStatus=error`, de modo que `run()` continua.
Gates deliberados de ativação (flag/kill switch/secrets) permanecem gate
humana; com ela habilitada, a seleção avança deterministicamente.

## Evidência

1. **Defeito fixado na branch.** O teste foco `queue fetch fault is confined
   per cycle and the loop recovers` injeta 5xx/quebra no fetch e prova
   `queueStatus=error` + recuperação no ciclo seguinte; antes da correção,
   `run()` abortava na primeira falha.
2. **Seleção real no GitHub.** Runtime com fetch real contra a API do GitHub
   e executor espião (spy, sem delegação real): selecionou
   `Verah-os/Verah-Command-Center#179` no ciclo 1 e reportou
   `no_eligible_issue` no ciclo 2 (única elegível da fila naquele momento).
3. **Avanço após terminalização.** Fila sintética com duas elegíveis (ciclo 1
   → primeira, ciclo 2 → segunda, com spy): o Control Plane avança sozinho.
   O teste da branch `after terminalization the Control Plane selects the
   next eligible issue` codifica essa propriedade.
4. **Gates como proteção, não defeito.** `readControlPlaneRuntimeConfig` e
   `createControlPlaneExecutorRouter` falham fechado sem flag/kill switch/
   secrets; efeitos de risco caem no gate `HUMAN` fail-closed (`blocked`
   antes de qualquer executor consultado).

## Delta mínimo (branch `control-plane/issue-179`)

- `services/control-plane/runtime.ts` — try/catch por ciclo no fetch da fila.
- `tests/control-plane-runtime.test.mjs` — fault confinement/recuperação e
  avanço pós-terminalização.
- `docs/runbooks/control-plane-runtime.md` — branch skip semantics na tabela
  fail-closed.
- Este documento — auditoria com evidência.

## Riscos / gate humano remanescente

- Ativação do host não-prod (flag, kill switch, GitHub token, chave OpenHands
  Cloud) segue gate humana; o executor não a executa nem a contorna.
- Sem lock distribuído: exatamente uma instância do runtime por host.
- O dispatcher (`scripts/verah-os/dispatcher*`) permanece não invocado;
  eligibilidade é o contrato existente de `scripts/verah-os/policy.ts`.
