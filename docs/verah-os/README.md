# VERAH OS Core

VERAH OS organiza uma única entrega autorizada por ciclo. GitHub Issues e PRs
são a fila operacional; o repositório é a fonte da implementação; o Control
Plane 001 fornece os contratos de work item, execução, eventos, lock,
aprovação, budget, retomada e kill switch.

O Core adiciona uma skill unattended explicitamente invocada e um controlador
local fail-safe. Ele não cria novas tabelas e não acessa produção.

## Comandos

```text
pnpm verah:status    # lê checkpoint e fila
pnpm verah:dry-run   # seleciona sem mutações
pnpm verah:continue  # reserva uma issue e grava checkpoint local
pnpm verah:stop      # ativa o kill switch local
pnpm verah:resume    # remove o kill switch local
```

`continue` não implementa código nem faz merge sozinho. Ele prepara uma única
execução para `$verah-os-unattended`, que reconstrói contexto, entrega, testa,
abre PR e aplica os gates. O merge unattended exige o label humano adicional
`codex:auto-merge` e todos os checks definidos na política de release.

## Ativação local

O padrão é seguro: unattended desabilitado e kill switch ativo. Para uma
execução explicitamente autorizada, configurar apenas no ambiente do processo:

```text
VERAH_OS_UNATTENDED_ENABLED=true
VERAH_OS_KILL_SWITCH=false
VERAH_OS_MAINTAINERS=<login-autorizado>
```

Não salvar valores reais em `.env` versionado. A skill será descoberta pelo
Codex quando `.agents/skills/verah-os-unattended` estiver na cópia ativa do
projeto após o merge.

## Automação recorrente

A instalação atual do Codex suporta automações, mas nenhuma foi ativada nesta
branch: a skill ainda não existe na `main`. Depois do merge, criar uma automação
local pausada, revisar o prompt e somente então habilitá-la para invocar
explicitamente `$verah-os-unattended`. O primeiro ciclo deve ser dry-run.
