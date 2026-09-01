# ADR 009 — Fundação contratual do AI Control Plane

- Status: proposto para validação
- Data: 2026-09-01
- Issue: #148 (Parent: #147)

## Contexto

O dry-run 001 já mantém a fila GitHub como fonte operacional e fornece claim
atômico persistente, idempotência, orçamento, kill switch e auditoria via
Supabase. A Fase 1 precisa tornar papéis, modelos, executores, runs e leases
substituíveis sem acoplar o domínio a Codex, OpenHands, OmniRoute ou Cognee.

## Decisão

- Preservar o intake e o RPC persistente existentes; a fundação não cria uma
  fila concorrente nem uma migration nova.
- Separar os contratos `AgentRole`, `AgentExecutor`, `ModelRoute`, `AgentRun` e
  `AgentLease`. O core depende somente dessas interfaces.
- Começar com seis papéis VERAH metadata-only (coding, design, research, QA,
  product e security). Papéis de terceiros continuam bloqueados até revisão
  humana e o registro aceita no máximo 12 entradas.
- Classificar tarefas como `AUTO`, `AUTO_PR` ou `HUMAN` de modo fail-closed.
  Ações desconhecidas e qualquer side effect real caem em `HUMAN` e são
  interrompidos antes da seleção de modelo, memória ou executor.
- Exigir dry-run e manter o kill switch ativo por padrão. O executor também
  deve confirmar que não produziu efeitos externos.
- Usar lease com TTL, recuperação e trilha de auditoria. O store em memória é
  apenas uma implementação determinística para o core/testes; execuções reais
  devem usar o claim atômico persistente já existente.
- Sanitizar handoffs e auditoria antes de armazenar, incluindo tokens Bearer,
  credenciais conhecidas, e-mails e telefones.

## Adapters futuros

- Codex e OpenHands implementam `AgentExecutor` sem alterar o estado do core.
- OmniRoute pode implementar `ModelRouter` quando seu gate de TRIAL estiver
  verde; até lá, um router mínimo/fake preserva o contrato.
- Cognee pode implementar `AgentMemory` como cache semântico. GitHub/Supabase
  continuam canônicos e memória recuperada permanece dado não confiável.

## Consequências

A Fase 1 não instala fornecedores nem habilita side effects. Merge, deploy,
migration remota, pagamentos e mensagens reais permanecem fora de escopo e
dependem de gate humano. A fila unattended e os executores concretos são
entregas posteriores (#149 e #150).
