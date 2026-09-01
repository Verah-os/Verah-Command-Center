# Langflow + unattended queue do VERAH Control Plane

## Arquitetura

Langflow é uma camada visual fina. O flow reproduzível está em
`flows/langflow/control-plane-unattended-v1.json`, mas toda lógica crítica vive
em `services/control-plane`: classificação de gate, idempotência, lease,
seleção de executor, retries, dead-letter, kill switch e relatório.

GitHub continua sendo a fila/fonte operacional. Langflow aceita apenas eventos
normalizados de GitHub; campos de comando/script são rejeitados e corpo livre
da Issue nunca vira comando. Required checks continuam sendo a autoridade de
qualidade e o flow não possui operação de merge/deploy.

## Política v1

- execução serial por padrão; `maxParallel=2` pode ser habilitado somente para
  Issues e branches distintas. O router reserva um executor por run;
- router filtra por tipo de tarefa e ordena por prioridade ou menor custo;
- fallback acontece antes da execução e dentro do mesmo lease. Uma falha após
  início não é entregue a outro executor, evitando reprocessamento parcial;
- cada evento possui chave de entrega; cada retry recebe uma chave de tentativa
  derivada, mantendo deduplicação e auditoria;
- `HUMAN` termina em `blocked`; falha persistente termina em `dead_letter` após
  no máximo 2 tentativas na especificação v1;
- fila desabilitada, kill switch ativo e dry-run obrigatório por padrão.

## Execução segura

1. Importe/reproduza a especificação no Langflow sem adicionar lógica Python
   ou comandos na UI.
2. Conecte os nodes somente ao `LangflowControlPlaneAdapter` em sandbox.
3. Confirme que `enabled=true`, `killSwitch=false` e `dryRun=true` são aplicados
   apenas no ambiente de piloto.
4. Enfileire fixtures sintéticas; não use Issues com credenciais, dados reais,
   produção, pagamentos, mensagens ou migrations remotas.
5. Verifique o relatório `completed | blocked | deadLetter` e a trilha de
   acquire/release do lease.
6. Reative o kill switch ao finalizar o piloto.

## Critérios de parada

Pare se Langflow tentar executar comandos arbitrários, guardar secrets, criar
uma segunda fila canônica, ignorar HUMAN, alterar produção ou avançar sem
Required checks. Preserve eventos dead-letter; requeue exige decisão explícita.
