# Fase 4 — fixture Review/QA/Security

- Data: 2026-09-01
- Ambiente: local, sandbox e dry-run
- Fonte canônica: evidências estruturadas do `AgentRun`

## Resultado

| Avaliador | Regra determinística da fixture | Autoridade |
|---|---|---|
| Review | Draft PR e handoff obrigatórios | somente aprovar/bloquear |
| QA | check `Required` presente e todos os checks aprovados | somente aprovar/bloquear |
| Security | dry-run, zero efeitos externos e nenhum gate HUMAN | somente aprovar/bloquear |

As três avaliações são executadas de forma independente sobre uma cópia
imutável e sanitizada das evidências. Ausência, erro, estado pendente, achado
bloqueante ou efeito externo de qualquer avaliador termina em `blocked`.

Esta fixture valida o contrato e o fail-closed. Ela não afirma que modelos ou
serviços externos de Review/QA/Security estejam operando em produção.
