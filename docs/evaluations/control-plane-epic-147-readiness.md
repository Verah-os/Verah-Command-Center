# Readiness do EPIC #147 — VERAH AI Control Plane

- Data: 2026-09-01
- Base auditada: `main` após as Fases 0–5 do #147 + fixture da Fase 6
- Ambiente demonstrado: fixtures locais em sandbox/dry-run

## Critérios de aceite

| Critério | Estado | Evidência / lacuna |
|---|---|---|
| Codex + OpenHands no mesmo contrato | parcial | `AgentExecutor`, router e adapter OpenHands existem; transporte OpenHands e adapter Codex reais seguem bloqueados até sandbox isolado |
| Gemini sem alterar contratos centrais | atendido | novo executor implementa somente `AgentExecutor` |
| indisponibilidade não paralisa fila | atendido | fallback por availability e tarefa recuperável quando todos indisponíveis |
| duas Issues independentes em paralelo | atendido | batch concorrente com branches, leases e executores reservados distintos |
| uma Issue não usa dois executores | atendido | issue dedupe + lease exclusivo + reserva do router |
| PR/checks/handoff padronizados | atendido no contrato | `AgentRunArtifacts` e handoff; executores reais ainda precisam preencher |
| HUMAN fail-closed | atendido | bloqueio anterior a modelo, memória e executor |
| custo/tempo/rework observáveis | atendido | run + resumo agregado da fila |
| memória não concorre com GitHub/Supabase | atendido | Cognee permanece adapter/cache TRIAL, sem runtime canônico |
| unattended não produtivo end-to-end | atendido por fixture | lote de 3 tarefas e batch paralelo; instância Langflow real ainda não importada |
| produção/efeitos reais bloqueados | atendido | dry-run, kill switch e gates; zero efeito externo nos testes |

## Fases

| Fase | Estado |
|---|---|
| 0 — POCs OmniRoute/Cognee/papéis | concluída como TRIAL (#152) |
| 1 — foundation | concluída (#148) |
| 2 — OpenHands adapter | contrato concluído; piloto real isolado pendente (#149) |
| 3 — Langflow/unattended queue | especificação + fixture concluídas (#150) |
| 4 — Review/QA/Security agents | gate independente concluído por fixture; agentes/modelos reais pendentes de sandbox |
| 5 — Design/Research/Product squads | planejamento pré-execução concluído por fixture; agentes/modelos reais pendentes de sandbox |
| 6 — Cost Router/OmniRoute | router interno e gate concluídos por fixture; OmniRoute desabilitado (`TRIAL`, 15/27) até POC verde |
| 7 — Shared Memory/Cognee | pendente; depende de piloto controlado |
| 8 — unattended operacional | fixture concluída; runtime isolado e relatório real pendentes |

## Decisão

O épico permanece aberto. Fechá-lo agora confundiria paridade contratual de
fixture com operação real. As Fases 4–5 agora bloqueiam lacunas de revisão,
proveniência e conflitos entre Research, Design e Product. A Fase 6 entrega
seleção interna por custo com fallback e mantém OmniRoute fora do runtime porque
a matriz canônica atual falha em 12/27 casos. Agentes/modelos reais e
OpenHands/Langflow reais continuam atrás dos stop gates até existir ambiente
isolado.
