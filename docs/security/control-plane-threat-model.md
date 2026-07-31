# Threat model — Control Plane 001

## Ativos protegidos

- integridade do repositório e da branch `main`;
- credenciais de GitHub, Supabase, Vercel e integrações;
- estado e trilha de auditoria do Control Plane;
- budgets, aprovações e locks;
- dados pessoais eventualmente presentes em issues.

## Limites de confiança

O corpo, título, comentários e metadados da issue são não confiáveis. O Route Handler, a configuração server-side e a RPC formam a fronteira confiável. O banco local/isolado persiste apenas dados reduzidos; produção e APIs externas ficam fora do limite desta versão.

## Ameaças e controles

| Ameaça | Controle no MVP |
|---|---|
| Prompt injection na issue | parser estrutural, sanitização e plano declarativo sem executor |
| Webhook falsificado | HMAC SHA-256 e segredo sintético server-side |
| Replay ou entrega duplicada | `external_event_id` único e transação serializada por advisory lock |
| Evento fora de ordem | comparação de `issue_updated_at`; evento antigo é registrado como ignorado |
| Aprovação forjada | decisão explícita e login em allowlist; integração real permanece fora do escopo |
| Duas issues simultâneas | lock global com lease e aquisição atômica |
| Lock abandonado | expiração, retomada e incremento de `resume_count` |
| Transição indevida | máquina de estados allowlist e constraints no banco |
| Estouro de custo ou tempo | budget persistido, deadline e bloqueio antes de concluir |
| Vazamento em auditoria | allowlist de campos, hashing do corpo e redação de secrets/PII |
| Mutação de eventos | trigger bloqueia `UPDATE` e `DELETE` |
| Chamada direta da RPC | revogação de `PUBLIC`/`anon`/`authenticated` e validação da claim `service_role` |
| Habilitação acidental em produção | configuração exige opt-in e rejeita sempre `NODE_ENV=production` |
| Efeito externo acidental | não existe adaptador de GitHub, shell, Vercel, n8n ou Supabase remoto |

## Gates humanos futuros

Executor, credenciais, custos externos, migration remota, deploy, merge, exclusão e mensagens reais exigem autorização específica e ficam fora deste ADR.

## Kill switch

`CONTROL_PLANE_KILL_SWITCH` é fail-safe: ausente ou diferente de `false` bloqueia o intake. Ele impede novas transições antes de qualquer persistência. Uma futura versão deverá acrescentar revogação operacional centralizada e observabilidade independente.

## Risco residual

O webhook sintético confia que o emissor autorizado representa corretamente a aprovação do mantenedor. Não há consulta read-only ao GitHub nesta versão. O sistema também não mede custo real de modelos ou infraestrutura; trabalha apenas com unidades sintéticas limitadas.

