# ADR 007 — Fila persistente e budget do VERAH OS

- Status: aceito para o Alpha da Issue #95
- Data: 2026-08-05
- Dependências: ADR 004 e ADR 005

## Contexto

O dispatcher avaliava o budget antes de reservar uma nova Issue. Quando a
janela não tinha capacidade, o trabalho permanecia apenas como resultado de
seleção e podia ser escolhido novamente depois de reinício. O estado local
também não distinguia uma pausa de budget, quota ou rate limit de uma pausa
genérica.

## Decisão

O estado atômico do dispatcher passa à versão 2 e contém um único item de fila:
Issue, branch, SHA base, run do checkpoint, PR opcional, fase e horário da
reserva. Para uma execução mutável, o pai primeiro chama a reserva canônica do
VERAH OS, que grava checkpoint, lease e lock do GitHub; em seguida persiste o
mesmo vínculo na fila antes de avaliar capacidade para invocar o Codex. Uma
falha entre essas duas escritas é reconciliada pelo checkpoint, que continua
tendo precedência.

Os estados sanitizados incluem `queued`, `waiting_budget`, `waiting_quota`,
`waiting_rate_limit`, `waiting_authentication` e `resuming`. `nextAttemptAt`,
consumo da janela e capacidade reservada aparecem no status. Expirar a janela
zera apenas contadores e backoff; não remove fila, checkpoint, lease ou lock.

Invocações e tokens possuem reservas separadas para o PR corrente. Uma nova
feature não consome essa reserva, enquanto correções e reconciliação do PR
podem usá-la. Tokens reportados contam somente entrada não cacheada mais saída;
o contexto de entrada marcado como cacheado pelo CLI é subtraído.

## Persistência, recuperação e idempotência

- `state.json` continua com escrita por arquivo temporário e rename atômico;
- `state.previous.json` preserva o snapshot anterior e o leitor migra v1 para
  v2 sem selecionar novo trabalho;
- checkpoint ou PR existente sempre vence a descoberta da fila;
- backoff persistido impede loops após reinício do processo ou do Windows;
- mutex com PID morto continua recuperável sem encerrar um PID vivo;
- branch, PR revisado ou PR mesclado são reconciliados antes de qualquer nova
  invocação.

## Consequências e limites

O estado local é somente coordenação do host e não duplica o Control Plane.
Não há migration, acesso a banco remoto, produção, mensagem, pagamento,
deploy, custo automático ou alteração de ruleset. O rollback é parar o
dispatcher, voltar ao binário anterior e preservar `.verah-os/` para auditoria
e reconciliação humana; fila e checkpoint nunca devem ser apagados manualmente.
