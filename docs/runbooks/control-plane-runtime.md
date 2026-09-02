# Runbook — Control Plane runtime não-produção (#170)

Entrypoint real e mínimo para rodar a arquitetura aprovada do #147 fora de
produção. Não é demo: compõe o Control Plane existente
(`GuardedControlPlane`, fila unattended, leases, gates de revisão, relatório
operacional) com `createControlPlaneExecutorRouter(process.env, ...)` e a
fila operacional do GitHub como fonte da verdade. O dispatcher não é invocado
nem reutilizado como Control Plane.

## Modelo de host/process suportado

- **Um único processo de longa duração** em ambiente não-produção: máquina do
  fundador, VM, container ou worker não-prod de PaaS. Hospedagem serverless
  (Vercel preview) **não** é modelo suportado para o runtime unattended.
- Rode **exatamente uma instância**. O lock em processo (leases +
  deduplicação) e a checagem de PR aberto na branch do lease cobrem o
  processo e restarts, mas duas instâncias simultâneas não têm lock
  distribuído neste estágio.
- O processo é **read-only no GitHub** (lista issues e PRs). Quem muda labels
  é o humano: após o Draft PR abrir, remova `codex:ready` ou aplique
  `codex:awaiting-review`; caso contrário o issue volta a ser elegível.

## Comando de start

```bash
CONTROL_PLANE_RUNTIME_ENABLED=true \
CONTROL_PLANE_KILL_SWITCH=false \
GITHUB_TOKEN=<token-do-secret-store> \
OPENHANDS_CLOUD_TRANSPORT_ENABLED=true \
OPENHANDS_CLOUD_API_KEY=<key-do-secret-store> \
pnpm control-plane:runtime
```

Com defaults o processo roda **1 ciclo** (seleciona no máximo 1 issue
elegível, drena a fila, imprime o relatório operacional e sai 0). Para
processamento contínuo bounded, aumente `CONTROL_PLANE_RUNTIME_MAX_CYCLES` e
ajuste `CONTROL_PLANE_RUNTIME_POLL_INTERVAL_MS`.

## Configuração

| Variável | Obrigatória | Default | Notas |
|---|---|---|---|
| `CONTROL_PLANE_RUNTIME_ENABLED` | sim | — | deve ser exatamente `true` |
| `CONTROL_PLANE_KILL_SWITCH` | sim | ativo | somente `false` libera; qualquer outra coisa mantém halt |
| `GITHUB_TOKEN`/`GH_TOKEN` | sim | — | leitura da fila + checagem de PR na branch do lease |
| `OPENHANDS_CLOUD_TRANSPORT_ENABLED` + `OPENHANDS_CLOUD_API_KEY` | sim | — | sem executor disponível o runtime falha fechado (`executor_unavailable`); ver `openhands-cloud-transport.md` |
| `CONTROL_PLANE_REPOSITORY` | não | `Verah-os/Verah-Command-Center` | formato `owner/repo` |
| `CONTROL_PLANE_RUNTIME_MAX_CYCLES` | não | `1` | 1–100; bounded por design |
| `CONTROL_PLANE_RUNTIME_POLL_INTERVAL_MS` | não | `60000` | intervalo entre ciclos |
| `CONTROL_PLANE_RUNTIME_MAX_QUEUE_STEPS` | não | `10` | limite de itens processados por drenagem |
| `CONTROL_PLANE_RUNTIME_MAX_ATTEMPTS` | não | `2` | retries por item antes de dead-letter |
| `CONTROL_PLANE_RUNTIME_BRANCH_PREFIX` | não | `control-plane/issue-` | uma branch isolada por issue |
| `CONTROL_PLANE_RUNTIME_LEASE_TTL_MS` | não | `60000` | TTL do lease por issue |

## Fail-closed (verificado em teste)

| Condição | Comportamento |
|---|---|
| `NODE_ENV=production` | recusa start (`production_environment`), independente das flags |
| flag/token/kill switch ausentes | recusa start com razão sanitizada, exit 1 |
| sem executor (credenciais OpenHands ausentes) | recusa start (`executor_unavailable`) — nunca roda router vazio |
| nenhuma issue elegível | ciclo no-op (`no_eligible_issue`) |
| issue com `codex:in-progress` | lock repository-wide: seleção pausada (`repository_delivery_lock`) |
| PR aberto na branch do lease | issue pulada (`branch_already_delegated`) — uma issue/uma branch |
| checagem de PR indisponível | ciclo seleciona nada (nunca executa na dúvida) |
| gate HUMAN (efeitos de risco) | item `blocked` antes de qualquer executor |
| falha persistente do executor | retries bounded, depois `dead_letter` |

## Elegibilidade (contrato GitHub existente, não reinventado)

O intake consome `isExecutableIssue`/`selectExecutableIssues` de
`scripts/verah-os/policy.ts`: issue OPEN com `codex:authorized` +
`codex:ready`, sem `codex:blocked`/`codex:in-progress`, com as seções
obrigatórias do template (Objetivo/Escopo/Critérios de aceite), ordenada por
prioridade/idade. Mapeamento determinístico de label → kind:
`documentation`→documentation, `frontend`→isolated_ui, `database`→migration_file
(AUTO_PR), `security`→authorization (AUTO_PR), demais→isolated_code (AUTO).
Efeitos declarados são sempre `local_files`, `repository_branch`, `sandbox`;
qualquer efeito de risco cai no gate HUMAN fail-closed.

## Ativação humana (uma vez, gate real)

1. Completar a ativação do transporte OpenHands Cloud
   (`docs/runbooks/openhands-cloud-transport.md`): API key + `GITHUB_TOKEN` no
   secret store do host, nunca em `.env` versionado, logs, testes ou PRs.
2. Liberar o kill switch deliberadamente (`CONTROL_PLANE_KILL_SWITCH=false`)
   somente no ambiente não-prod.
3. Rodar um ciclo (`MAX_CYCLES=1`) e conferir o relatório operacional:
   `gates.human` lista bloqueios fail-closed; `perExecutor` registra
   executor/modelo/custo/duração.
4. Piloto seguinte ordenado por dependência: **#169 Auth Mobile** (issue AUTO
   elegível, delegada via transporte OpenHands, termina em Draft PR).

## Limites (inalterados)

- Sem produção, secrets, pagamentos/mensagens reais, migrações remotas ou
  operações destrutivas; Draft PR é o limite; merge/deploy seguem gates
  humanos/CI existentes.
- GitHub continua a fonte operacional; Supabase continua o estado; memória
  compartilhada é read-only e nunca autoritativa.
- O dispatcher (`scripts/verah-os/dispatcher*`) não é invocado nem reutilizado
  como Control Plane.
