# Handoff — Issue #176 (auditoria de convergência VERAH × mobile)

- **Issue / PR:** #176 / PR aberto na branch `openhands/issue-176-convergence-audit`
- **Commit:** HEAD da branch `openhands/issue-176-convergence-audit` (base `main` `d037e93`)
- **Files changed:** `docs/ship-verah/convergencia-verah-mobile.md`, `docs/handoffs/2026-09-02-issue-176-convergence-audit.md`
- **Behavior delivered:** mapa de convergência verificável das 14 capacidades mínimas (#164 × mobile pós-#172/#174), classificadas REUTILIZAR / EXPOR NO MOBILE / ADAPTAR UX / NOVO SOMENTE SE NÃO EXISTIR, com evidência por caminho e flags de duplicação, sob o guardrail #175.
- **Focused tests:** nenhum — mudança exclusivamente documental (docs + handoff), conforme `docs/codex-validation-matrix.md` (documentation only → diff review + markdown sanity).
- **Required checks:** CI remoto do PR (docs-only); nenhuma suíte local exigida.
- **Invariant/decision discovered:** criação de veículo permanece RPC-only (`confirm_customer_vehicle`, insert revogado de `authenticated` em `20260827040000`) e `service_requests` já tem policy de criação por cliente — o CTA "Preciso de ajuda" no mobile é EXPOR NO MOBILE via PostgREST/RLS, sem endpoint novo.
- **Remaining blocker/risk:** nenhum. Capacidades classificadas NOVO (combustível/despesas, documentos do veículo, motor de lembretes, dashboard de valor) aguardam issues próprias com seção `Convergência` (#175).
- **Codex usage:** n/d.

## Next session
Abrir a próxima Issue com Context Pack citando `docs/ship-verah/convergencia-verah-mobile.md`. Não herdar narrativa desta sessão.
