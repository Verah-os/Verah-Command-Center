# Handoff — Issue #148 (Control Plane foundation)

- **Issue / branch:** #148 / `codex/148-control-plane-foundation`
- **Arquitetura:** o dry-run 001 e seu claim persistente continuam sendo a
  fronteira operacional; a nova fundação adiciona contratos portáveis e uma
  implementação determinística para testes, sem fila ou migration paralela.
- **Entrega:** contratos separados para role/model/executor/run/lease; registro
  curado com seis papéis internos; gates `AUTO | AUTO_PR | HUMAN` fail-closed;
  lease exclusivo com TTL/recuperação; kill switch; dry-run; idempotência;
  falha recuperável; custo/handoff opcionais; auditoria sanitizada.
- **Adapters:** Codex/OpenHands entram por `AgentExecutor`; OmniRoute por
  `ModelRouter`; Cognee por `AgentMemory`. Nenhum componente TRIAL foi acoplado.
- **Invariantes:** GitHub permanece a fila; HUMAN não chega ao executor; o
  executor não escolhe a próxima Issue; zero efeitos externos nesta fase.
- **Testes focados:** `node --experimental-strip-types --test
  tests/control-plane-foundation.test.mjs tests/control-plane-dry-run.test.mjs`
  — 17/17 aprovados.
- **Verificações:** `pnpm typecheck` aprovado; `pnpm lint` aprovado com um
  aviso preexistente em `app/demo/prestador/atendimento/[id]/page.tsx`;
  `pnpm build` aprovado (avisos preexistentes de Edge Runtime e lint).
- **Próxima sessão:** após revisão humana da #148, conectar um executor
  OpenHands por adapter na #149. Não herdar narrativas além destes invariantes.
