# Handoff — Control Plane e Sprint Alpha

Data de referência: 2026-08-02

## Estado seguro

- `main`: `7643a095afb33a543464171513c50c3e4b02a219`.
- PR #66 (`feat(alpha): add communication intake foundation`): mesclado.
- PR #69 (`feat(alpha): add intelligent intake foundation`): mesclado na `main`.
- PR #68 (`feat(control-plane): add supervised dry-run intake`): reconciliado com a `main`, aberto e não mesclado.
- Branch: `feat/control-plane-001-dry-run`.
- A branch está 0 commits atrás da `main`; o merge de reconciliação preservou os testes de Control Plane e de intake inteligente no mesmo pipeline.
- GitHub Integration → Deploy to production do Supabase permanece desabilitado.
- Nenhuma migration foi aplicada remotamente e produção não foi acessada ou alterada.

## Commits de implementação do PR #68

- `f84af28` — `docs(control-plane): define dry-run architecture`
- `02cbdd9` — `feat(db): persist control plane dry-run state`
- `3b0898f` — `feat(control-plane): add synthetic dry-run intake`
- `e5dc2bf` — `style(control-plane): normalize file endings`
- `1d4e6ac` — `docs(handoff): record control plane and alpha status`
- `f3b6484` — `merge: reconcile control plane with intelligent intake`

O commit exclusivamente documental que adiciona este handoff deve ser consultado no histórico do PR, pois um arquivo não pode registrar antecipadamente o SHA do próprio commit.

## Entrega principal do PR #68

- ADR e threat model do Control Plane 001.
- Contratos persistentes privados para work items, execuções, eventos, locks, aprovações e budgets.
- Máquina de estados validada e parser de template de issue.
- Intake sintético idempotente protegido por HMAC e allowlist de mantenedores.
- Lock global, budget, timeout, retomada simulada, relatório dry-run e kill switch.
- Testes Node e SQL com payloads exclusivamente sintéticos.

Arquivos centrais:

- `docs/architecture/decisions/002-control-plane-dry-run.md`
- `docs/security/control-plane-threat-model.md`
- `app/api/control-plane/dry-run/route.ts`
- `services/control-plane/`
- `supabase/migrations/20260731225632_control_plane_001_dry_run.sql`
- `supabase/tests/control_plane_dry_run.sql`
- `tests/control-plane-dry-run.test.mjs`

## Validações

- 33 testes Node aprovados após a reconciliação.
- Typecheck aprovado.
- Lint aprovado, com um warning preexistente e fora do escopo.
- Next.js build aprovado.
- Replay integral de 31 migrations em Supabase local oficial com `--no-seed`.
- Replay incremental com fixture sintética aprovado.
- Matrizes SQL de autorização administrativa, RLS, identidade, comunicação, Control Plane e intake inteligente aprovadas.
- Teste concorrente de identidade aprovado para duas chamadas simultâneas.
- Schema lint dos schemas `public` e `private` sem erros ou warnings.
- Os checks remotos devem ser reexecutados após o push da reconciliação antes do merge.

## Decisões e limitações atuais

- O Control Plane 001 é estritamente dry-run e fica desabilitado por padrão.
- O modo sintético não pode ser habilitado em produção.
- Não existe executor, execução de código do projeto ou comando externo mutável.
- Não cria branch, commit, comentário, PR ou merge automaticamente.
- Não consulta o GitHub real para comprovar aprovação; a validação é sintética por allowlist configurada.
- Budgets são unidades sintéticas, não representam faturamento real.
- Não há acesso a Supabase, Vercel, n8n ou outros ambientes remotos.
- Eventos persistidos são imutáveis e o payload armazenado é reduzido e sanitizado.

## Credenciais e dependências externas

- Nenhuma credencial real foi adicionada ao repositório.
- Credenciais Meta necessárias para outbound e ingestão real de mídia da Sprint Alpha continuam ausentes.
- Credenciais e integração GitHub read-only para uma futura validação real do Control Plane continuam fora do escopo.
- Nenhum `.env`, dump, volume, log com segredo ou relatório privado integra este handoff.

## Próximo passo recomendado

Concluir os checks remotos do PR #68 e fazer o merge somente se a branch permanecer atualizada, mergeável e integralmente verde. Não executar migrations remotas.

Sequência futura, somente após autorização específica:

1. VERAH OS Core da Issue #71, usando o Control Plane existente sem ampliar acesso a produção.
2. Control Plane 002 read-only.
