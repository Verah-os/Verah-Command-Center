# Piloto sintético — Langflow unattended queue v1

- Data: 2026-09-01
- Ambiente: fixture local, sandbox/dry-run, zero efeitos externos.

| Tarefa | Roteamento | Resultado | Tentativas |
|---|---|---|---:|
| código isolado | Codex unavailable → OpenHands | completed | 1 |
| deploy sintético | HUMAN | blocked, zero executor | 1 |
| falha persistente | Codex unavailable → OpenHands | dead-letter | 2 |

Resumo esperado: 1 completed, 1 blocked, 1 dead-letter, 4 runs. O piloto prova
processamento sem copiar/colar humano, fallback dentro do mesmo lease,
idempotência e limite de retry. Não representa Langflow/OpenHands em produção.

Um segundo cenário executa duas Issues sintéticas em paralelo com branches,
executores e leases distintos. Ambas geram handoff, Draft PR/check estruturado,
custo e duração; a reserva impede que o mesmo executor seja usado duas vezes.
