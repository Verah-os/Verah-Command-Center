# Handoff — Issue #149 (OpenHands fallback executor)

- **Issue / branch:** #149 / `codex/149-openhands-fallback`
- **Files changed:** `services/control-plane/openhands-executor.ts`,
  `services/control-plane/{types,foundation}.ts`,
  `tests/control-plane-openhands.test.mjs`, runbook/pilot/handoff.
- **Behavior delivered:** OpenHands é selecionável via `AgentExecutor` com
  readiness normalizado, timeout preemptivo, cancelamento, falha recuperável,
  custo/duração e logs/handoff sanitizados; CI usa transporte fake.
- **Focused tests:** `node --experimental-strip-types --test
  tests/control-plane-openhands.test.mjs tests/control-plane-foundation.test.mjs`
  — 15/15 aprovados.
- **Invariant/decision:** headless OpenHands autoaprova ações; transporte real
  permanece bloqueado até workspace efêmero, egress restrito e pacote pinado.
- **Remaining risk:** piloto real de tempo/custo exige ambiente isolado; o
  piloto atual comprova somente paridade contratual com fixture.
- **Codex usage:** indisponível.

## Next session

Abrir o Context Pack da #150. Não herdar narrativa além destes invariantes.
