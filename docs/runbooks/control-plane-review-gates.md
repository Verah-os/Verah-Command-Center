# Review/QA/Security gates

O `IndependentReviewGate` é opcional na construção da fila para preservar
compatibilidade, mas deve ser fornecido em qualquer piloto da Fase 4. Ele roda
somente após um `AgentRun` concluído e antes de a fila marcar a entrega como
`completed`.

## Operação segura

1. Mantenha Control Plane, fila e executores em dry-run/sandbox.
2. Registre exatamente um agente para cada disciplina: `review`, `qa` e
   `security`.
3. Forneça somente o contrato `ReviewEvidence`; não passe comandos, workspace,
   credenciais, ferramentas de merge ou acesso de produção aos avaliadores.
4. Considere `completed` apenas quando `ReviewGateResult.status` for `passed`.
5. Preserve achados e checks no relatório/auditoria; não transforme memória do
   agente em fonte canônica.

## Fail-closed

Pare a entrega em `blocked` se um agente estiver ausente, lançar erro, devolver
avaliação inválida ou pendente, relatar efeito externo ou produzir achado
bloqueante. Reprocessamento requer nova execução explícita do Control Plane; o
avaliador nunca faz merge nem inicia a próxima Issue.
