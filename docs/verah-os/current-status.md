# Status executivo do VERAH OS

Atualizado em 5 de agosto de 2026.

- `main`: `216d2899160a6e1942f06eb16027beedbeb6778a`.
- Control Plane 001: integrado pelo PR #68; migration apenas versionada.
- VERAH OS unattended: integrado pelo PR #72; Issue #71 encerrada.
- Quote Intelligence Core: integrado pelo PR #70.
- Quote Quality & Comparison: integrado pelo PR #86.
- Second Opinion & Vehicle Movement: integrado pelo PR #94.
- Issue ativa: #95 — VERAH OS Budget Manager & Queue Persistence.
- PR ativo: branch `feat/95-p0-verah-os-budget-manager-queue-persistence` em
  entrega por draft PR.
- Skill supervisionada: `verah-autonomous-delivery` preservada.
- Skill unattended: `verah-os-unattended` instalada localmente.
- Automação recorrente: desativada enquanto a recuperação local é validada;
  nenhuma retomada ocorre sem invocação explícita da Skill.
- Dry-run: validou leitura de GitHub, ADRs, handoffs e roadmap, detectando PR
  existente sem criar trabalho duplicado.
- Ciclo controlado: retomou o PR #70 e foi encerrado explicitamente após o
  merge e a CI verde.
- CI da `main`: Application, Database authorization e Required aprovados.
- Vercel: deployment do commit da `main` aprovado.
- Supabase Preview: ignorado; nenhuma migration remota executada.
- Supabase Deploy to production: desabilitado e preservado.
- Blocker de produção: Issue #83.

## Estados executivos

- `running`: checkpoint e lease vigentes;
- `interrupted`: checkpoint sem lease vigente;
- `recovering`: reconciliação local/GitHub em andamento;
- `blocked`: gate de segurança impede continuidade;
- `idle`: nenhum ciclo ativo.

O dispatcher v2 acrescenta `queued`, `waiting_budget`, `waiting_quota`,
`waiting_rate_limit`, `waiting_authentication` e `resuming`, preservando o item
reservado, o backoff e a capacidade de correção durante reinícios.

## Funcionalidades disponíveis para teste

- fundação persistente de comunicação e intake WhatsApp sintético;
- intake inteligente determinístico até a fila do Concierge;
- Quote Intelligence Core determinístico com taxonomia Alpha e revisão humana
  obrigatória;
- operação supervisionada/unattended do VERAH OS até o gate de merge.

## Riscos atuais

- o catálogo de 59 regras ainda requer validação de especialistas automotivos;
- o classificador exige `service_code` explícito e não interpreta texto livre;
- credenciais Meta, n8n, provedor veicular e pagamentos não estão configurados;
- migrations recentes permanecem somente versionadas até a reconciliação
  autorizada de produção.
