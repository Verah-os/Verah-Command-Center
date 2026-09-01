# Design/Research/Product squads

O `CrossFunctionalProductSquad` é um gate opcional de planejamento pré-execução
da fila. Em pilotos da Fase 5, forneça-o como `planningGate`; a execução só começa
quando o `SquadPlanResult` estiver `ready`.

## Limites operacionais

- mantenha `dryRun`, sandbox e kill switch disponíveis;
- registre somente papéis curados `research`, `design` e `product`;
- use referências do GitHub/documentação canônica como evidência;
- não forneça credenciais, comandos, workspace, executor, merge ou produção aos
  agentes do squad;
- preserve o plano no item da fila apenas como contexto/auditoria, nunca como
  fonte de verdade concorrente.

## Fail-closed

Bloqueie antes do executor se Research não tiver proveniência, um papel estiver
ausente/pendente/falhar, um artefato não tiver evidência, houver efeito externo
ou Design/Product divergirem sobre a mesma decisão. Conflitos devem ser
escalados, nunca resolvidos silenciosamente pelo agregador.
