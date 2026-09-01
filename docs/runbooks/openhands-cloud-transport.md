# OpenHands Cloud transport — ativação não-produção

Este runbook ativa o caminho real **Control Plane → OpenHands Cloud** atrás do
contrato `AgentExecutor`/`OpenHandsTransport` existente
(`services/control-plane/openhands-executor.ts`). Nenhuma arquitetura paralela:
o `PolicyExecutorRouter`, leases, fila unattended, gates de revisão/segurança e
relatórios continuam idênticos — o transporte apenas substitui o fixture por
chamadas reais à API V1 do OpenHands Cloud (`https://app.all-hands.dev`).

## Fail-closed por padrão

Sem configuração explícita o transporte responde `offline` sem nenhuma chamada
HTTP e `createOpenHandsCloudExecutor` retorna `null`, portanto o router nunca
seleciona OpenHands Cloud. Também falha fechado quando:

- `NODE_ENV=production` (bloqueado independentemente das flags);
- flag, credencial ou base URL ausentes/inválidos;
- autenticação rejeitada (401/403) ou capacidade não verificável;
- a tarefa não tem branch isolada (`branchName` obrigatório);
- a `issueKey` não identifica um repositório `owner/repo#numero`.

## Ação humana mínima (gate real, executada uma vez)

1. Criar uma API key em OpenHands Cloud (Settings → API keys) com a conta
   destinada a trabalho **não-produção**.
2. Registrar a key no secret store do ambiente do Control Plane — nunca em
   `.env` versionado, logs, testes, PR bodies ou handoffs.
3. Definir as variáveis abaixo no ambiente não-produção e reiniciar o processo
   do Control Plane.

Nada mais é exigido: a partir daí o fallback do router invoca OpenHands Cloud
automaticamente, sem copy/paste do fundador.

## Configuração

| Variável | Obrigatória | Default | Notas |
|---|---|---|---|
| `OPENHANDS_CLOUD_TRANSPORT_ENABLED` | sim | — | deve ser exatamente `true` |
| `OPENHANDS_CLOUD_API_KEY` | sim | — | fallback legado: `OPENHANDS_API_KEY` |
| `OPENHANDS_CLOUD_BASE_URL` | não | `https://app.all-hands.dev` | somente `https://host[:porta]` |
| `OPENHANDS_CLOUD_MAX_RUNNING_CONVERSATIONS` | não | `4` | acima disso o readiness vira `busy` |
| `OPENHANDS_CLOUD_REQUEST_TIMEOUT_MS` | não | `15000` | timeout por chamada HTTP |
| `OPENHANDS_CLOUD_POLL_INTERVAL_MS` | não | `5000` | intervalo entre polls de status |
| `OPENHANDS_CLOUD_MAX_POLLS` | não | `360` | esgotamento vira falha recuperável |

## Como o Control Plane invoca (wiring)

```ts
import { createOpenHandsCloudExecutor } from "./services/control-plane/openhands-cloud-transport.ts";

const openhands = createOpenHandsCloudExecutor(process.env); // null => fail closed
const candidates = [
  { executor: codexExecutor, priority: 1, estimatedCostMicrounits: 10 },
  ...(openhands
    ? [{ executor: openhands, priority: 2, estimatedCostMicrounits: 20 }]
    : []),
];
const router = new PolicyExecutorRouter(candidates);
```

O repositório alvo é derivado da `issueKey` (GitHub continua fonte operacional)
e a branch vem do lease da tarefa (`task.branchName`), preservando uma Issue →
um executor lease → uma branch isolada.

## Ciclo de execução

1. `readiness`: `GET /api/v1/users/me` valida a credencial; em seguida a busca
   de conversas conta `execution_status === "running"` para mapear `busy`.
2. `execute`: `POST /api/v1/app-conversations` com prompt auto-contido que
   reafirma o contrato (branch isolada, exatamente um Draft PR, nunca mergear,
   nunca bypassar CI/review, sem produção/pagamentos/mensagens/migrations,
   HUMAN gates fail-closed, handoff padronizado).
3. Poll do start-task até `READY` e da conversa até `finished`/`stopped`/`error`.
4. Em `finished`, o handoff vem da última mensagem do assistente, o Draft PR é
   extraído do texto, e `metrics.accumulated_cost` (USD) vira `costMicrounits`
   quando presente; duração é medida pelo `OpenHandsExecutor` e tudo alimenta o
   registro executor/modelo/duração/custo/rework já existente.
5. Timeout/cancelamento abortam os polls e fazem best-effort de
   `POST /api/v1/sandboxes/{id}/pause`.

## Limites preservados

- O executor só roda com `dryRun: true` + `integrationSafe: true` (camada
  `OpenHandsExecutor` rejeita qualquer outra coisa).
- Draft PR é o limite: merge, deploy, migration remota e side effects reais
  continuam em gates humanos/review/CI — o transporte não altera nenhum deles.
- Logs e resultados passam pela sanitização existente; a API key nunca aparece
  em logs, erros, testes ou relatórios (verificado em teste).

## Checklist de ativação

- `pnpm test` e `pnpm typecheck` verdes com o transporte desabilitado;
- API key criada no secret store e nunca impressa;
- readiness real retorna `ready` (não `busy`/`offline`) no ambiente alvo;
- tarefa piloto pequena (AUTO, `isolated_code`) termina em Draft PR sem efeitos
  externos;
- kill switch (`CONTROL_PLANE_KILL_SWITCH`) testado antes e depois da ativação;
- verificar que o relatório operacional registra executor `openhands`, modelo,
  duração e custo da execução real.

Referência da API: https://docs.openhands.dev/ (Cloud API V1).
