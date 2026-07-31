# ADR 002 — Control Plane em dry-run

- Status: proposto para validação
- Data: 2026-07-31
- Issue: #67

## Contexto

A VERAH precisa transformar issues aprovadas em planos auditáveis sem conceder a um agente permissão implícita para alterar repositórios ou ambientes. Esta primeira versão deve provar intake, deduplicação, autorização, lock, orçamento, retomada e auditoria sem executar código do produto.

## Decisão

O Control Plane 001 será um componente server-side, desligado por padrão e impossível de habilitar quando `NODE_ENV=production`. Ele aceita apenas webhooks sintéticos assinados, valida o mantenedor contra uma allowlist configurada e persiste seu estado em tabelas internas no schema `private`.

Uma única RPC transacional, `public.process_control_plane_dry_run`, é a fronteira de escrita. Ela é `SECURITY DEFINER`, usa `search_path` vazio, valida a claim assinada `service_role`, não é executável por `PUBLIC`, `anon` ou `authenticated` e recebe somente dados já reduzidos e sanitizados.

O fluxo permitido nesta versão é:

```text
queued -> planning -> completed
queued -> waiting_approval
queued|planning|waiting_approval -> blocked|failed|cancelled
waiting_approval|blocked -> queued
```

Estados futuros (`implementing`, `testing`, `fixing` e `pr_open`) pertencem ao contrato, mas não podem ser alcançados pelo intake dry-run.

## Componentes

- Route Handler `/api/control-plane/dry-run`: recebe apenas payload sintético, valida tamanho e assinatura e falha fechado.
- Parser de issue: exige Objetivo, Escopo, Critérios de aceite e Restrições; conteúdo é tratado como texto não confiável.
- Validador de aprovação: aceita somente decisão explícita de um login presente em `CONTROL_PLANE_MAINTAINERS`.
- Máquina de estados: enumera transições válidas e rejeita qualquer transição não declarada.
- RPC transacional: deduplica delivery, cria um único work item/run, administra lease global, budget e relatório.
- Eventos append-only: updates e deletes são bloqueados por trigger.

## Invariantes

1. `(repository, issue_number)` identifica um único work item.
2. `external_event_id` identifica uma única entrega de webhook.
3. Um work item possui no máximo um run ativo.
4. Existe no máximo um lock global `control-plane:global`.
5. Lock expirado pode ser retomado sem criar outro run para o mesmo checkpoint.
6. Nenhuma tabela armazena credenciais ou o corpo bruto da issue.
7. O relatório sempre declara `repository_mutations=[]`, `production_mutations=[]` e `external_effects=[]`.
8. Budget e deadline são registrados antes da conclusão.

## Alternativas rejeitadas

- GitHub Action com token de escrita: aumentaria a superfície de privilégio antes de existir um executor aprovado.
- n8n no caminho crítico: enfraqueceria idempotência e fonte da verdade.
- Estado somente em memória: impediria retomada e auditoria após falhas.
- Tabelas no schema `public`: ampliariam desnecessariamente a superfície da Data API.
- Execução de comandos em sandbox: pertence a uma etapa futura e exige novo gate humano.

## Consequências

O protótipo consegue demonstrar controle e persistência, mas não verifica aprovação consultando o GitHub em tempo real. A assinatura e a allowlist protegem o payload sintético; uma integração real deverá usar uma GitHub App read-only e comprovar a origem da aprovação antes de habilitar qualquer executor.
