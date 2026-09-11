# Handoff — Issue #237 (Alpha 5 — runbook operacional e checklist de prontidão do piloto)

- **Issue / PR:** #237 / Draft PR #239 (branch `openhands/237-alpha5-runbook-readiness`)
- **Commit:** `6b37be3` (base `main` `d391782` — contém #233/#234; sem cherry-pick)
- **Files changed:** `docs/alpha-5-operations-runbook.md` (somente documentação)
- **Behavior delivered:** runbook da jornada canônica cliente→veículo→`service_request`→
  concierge→rede/prestador→orçamento/aprovação→leva & traz (custódia com consentimento/
  evidência/incidentes)→serviço→devolução→histórico/pós-venda, matriz
  pronto/bloqueado/Human Gate/futuro com evidência do repositório, checklists
  pré/pós-atendimento aos 5 clientes, fallback fail-closed para drift de schema
  remoto de mileage/fuel/maintenance/charging, métricas deriváveis sem schema novo
  e checklist de readiness executável com resultados reais e Human Gates listados com ação
  mínima exata.
- **Focused tests:** `pnpm test` 282/282 pass; `pnpm typecheck` ok; `pnpm lint` ok
  (1 warning pré-existente não-bloqueante); `pnpm build` ok; `cd mobile && pnpm test`
  80/80 pass; `cd mobile && pnpm typecheck` ok; `cd mobile && pnpm dlx expo-doctor@1`
  20/20. `pnpm ci:database` fica para o CI da PR (local Docker/Supabase CLI) — nenhum
  banco remoto toccato.

- **Invariant/decision discovered:** todas as capacidades citadas no runbook existem na
  `main` atual como contrato/tela/teste/runbook (auditoria #164); a única capacidade
  genuinamente parcial é a métrica de reincidência/retorno—reabertura é rastreável,
  mas retorno futuro é somente contagem de atendimentos por veículo/cliente; não há
  tabela de recorrência nem motor de diagnóstico; métricas de custo real, latência real
  de mensagens e tempo de execução do prestador não são deriváveis hoje (exigem gate).
- **Remaining blocker/risk (HUMAN gate, fail-closed):** ativação do piloto com clientes
  reais (fundador), produção Supabase/reconciliação (#83), prestadores reais, pagamentos
  reais, mensagens reais (WhatsApp/n8n) e App/loja (EAS/Apple/Google)— todos
  listados na seção 8 com ação mínima exata; nenhum executado nesta execução..
- **Codex usage:** n/d.: