# Roadmap executável da VERAH

Atualizado em 2 de agosto de 2026. GitHub Issues são a fonte operacional; a
ordem abaixo é sequencial e somente uma entrega pode receber `codex:ready` por
vez.

## Fundações integradas

- Control Plane 001 — PR #68.
- Intake inteligente Alpha — PR #69.
- VERAH OS unattended — PR #72.
- Quote Intelligence Core — PR #70.

## Fila do MVP

| Ordem | Issue | Entrega | Estado operacional | Dependência |
| --- | --- | --- | --- | --- |
| 1 | #73 | Quote Quality & Comparison | `codex:ready` | PR #70 |
| 2 | #74 | Second Opinion & Vehicle Movement | autorizada, aguardando | #73 |
| 3 | #75 | Multiple Providers & Invitations | autorizada, aguardando | #74 |
| 4 | #76 | Concierge Experience & Investor Demo | autorizada, aguardando | #75 |
| 5 | #77 | WhatsApp Worker & Media Ingestion | autorizada, aguardando | #76 e credenciais Meta |
| 6 | #78 | n8n Notifications & SLA | autorizada, aguardando | #77 |
| 7 | #79 | Vehicle Intelligence Provider Integration | autorizada, aguardando | #78 e decisão de provedor/custo |
| 8 | #80 | Knowledge Platform Operational Foundation | autorizada, aguardando | #79 e arquitetura #63 |
| 9 | #81 | Payments, Subscriptions & Finance Sandbox | autorizada, aguardando | #80 e decisão financeira |
| 10 | #82 | Customer PWA & Pilot Readiness | autorizada, aguardando | #81 |
| 11 | #83 | VERAH Production Readiness — Supabase Reconciliation | `codex:blocked` | #82 e gates de produção |
| 12 | #84 | End-to-End Pilot Release | autorizada, aguardando | #83 e go/no-go humano |

## Regras de seleção

1. Retomar PR aberto do item ativo antes de selecionar nova issue.
2. Exigir `codex:authorized` e `codex:ready` para implementar.
3. Recusar item cuja dependência não esteja concluída.
4. Remover `codex:ready` do item concluído antes de liberar o seguinte.
5. Produção, credenciais, custos, mensagens reais, pagamentos e decisões de
   produto continuam gates humanos.

## Limites permanentes

- nenhuma migration remota, `db push` ou `migration repair`;
- Supabase Deploy to production permanece desabilitado;
- nenhum bypass de ruleset ou merge sem os gates autorizados;
- IA é assistiva e não decide diagnóstico, segurança veicular, preço, reparo,
  prestador ou responsabilidade;
- n8n permanece fora do caminho crítico.

## Evolução do VERAH OS

Em paralelo apenas documental, o controlador deve acrescentar revisão de
arquitetura, inteligência de dependências, limites de decisão de produto e
relatórios de release. Essas melhorias não podem desviar ou desbloquear
prematuramente a fila do MVP.
