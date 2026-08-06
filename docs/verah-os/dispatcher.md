# Dispatcher contínuo do VERAH OS

## Modelo de segurança

O dispatcher é local, executa uma Issue por vez e começa desabilitado em
dry-run. Ele não substitui a Skill, o ruleset, o GitHub ou o Control Plane. Sua
única função é decidir quando é seguro invocar a Skill já autorizada.

Nunca configure credenciais no repositório, no arquivo local ou no Task
Scheduler. O processo filho não recebe variáveis de produção conhecidas de
Supabase, Vercel, n8n, Meta ou WhatsApp. A invocação usa `shell: false` e não
aceita bypass de sandbox, regras ou aprovação.

## Pré-requisitos

- Windows 11 com Node.js 22.17.1 e pnpm 9.15.9;
- GitHub CLI autenticado como mantenedor permitido;
- Codex CLI autenticado e acessível como `codex` ou pelo caminho configurado;
- repositório limpo e Skill `$verah-os-unattended` presente;
- `VERAH_OS_UNATTENDED_ENABLED=true`;
- `VERAH_OS_KILL_SWITCH=false` somente durante a janela autorizada;
- `VERAH_OS_MAINTAINERS` com o login permitido.

O Codex CLI documenta `codex exec` como modo não interativo e recomenda
`--sandbox workspace-write` para automação local. O dispatcher não usa modo de
bypass perigoso: <https://developers.openai.com/codex/cli/reference>.

## Configuração local

Crie, sem versionar, `.verah-os/dispatcher.config.json`:

```json
{
  "enabled": true,
  "dryRun": true,
  "maxCyclesPerWindow": 2,
  "maxInvocationsPerWindow": 4,
  "reserveInvocations": 1,
  "reserveReportedTokens": 25000,
  "windowDurationMs": 28800000,
  "pollIntervalMs": 300000,
  "baseBackoffMs": 60000,
  "maxBackoffMs": 3600000,
  "codexCommand": "codex"
}
```

O arquivo aceita somente campos operacionais. Variáveis com prefixo
`VERAH_OS_DISPATCHER_` têm precedência. Os argumentos podem ser confirmados por
`VERAH_OS_CODEX_ARGUMENTS_JSON`, mas somente a sequência canônica é aceita;
variações e configurações inseguras falham fechadas.

## Fila e budget persistentes

Em modo mutável, a Issue é reservada pelo fluxo canônico antes de o dispatcher
avaliar o budget da invocação. O estado v2 persiste atomicamente a Issue, branch,
SHA base, run do checkpoint, fase e PR opcional. Assim, `waiting_budget`,
`waiting_quota` e `waiting_rate_limit` mantêm a mesma fila durante reinício do
processo, reinício do Windows, watchdog ou expiração da janela.

O status inclui `nextAttemptAt`, consumo e saldo da janela e capacidade
reservada. `reserveInvocations` e `reserveReportedTokens` pertencem ao trabalho
corrente: uma nova feature espera sem consumir a reserva de correção do PR.
Tokens são entrada não cacheada mais saída reportadas pelo Codex CLI; entrada
cacheada não é recontada.

## Dry-run obrigatório

Mantenha `dryRun: true` e execute:

```text
pnpm verah:health
pnpm verah:dispatcher:status
pnpm verah:dispatcher:once
```

O teste `tests/verah-os-dispatcher.test.mjs` encadeia duas Issues sintéticas,
prova exclusividade, backoff e ausência de efeitos externos. Só altere `dryRun`
para `false` depois de revisar a saída e confirmar kill switch, budget e fila.

## Operação

```text
pnpm verah:dispatcher:start
pnpm verah:dispatcher:status
pnpm verah:dispatcher:once
pnpm verah:dispatcher:stop
```

`start` inicia o loop em background. `once` executa uma única decisão. `stop`
solicita encerramento limpo; não remove checkpoint, branch, PR ou logs. O
status mostra somente PID, identificadores, budget, heartbeat, backoff e
resultado categorizado.

- `running`: uma decisão ou invocação está ativa;
- `paused:ci_pending`: aguarda checks;
- `paused:review_pending`: aguarda revisão humana;
- `paused:human_review`: gate de release/merge ou limite de correções;
- `paused:rate_limit|quota|authentication`: backoff sem loop de consumo;
- `paused:budget`: janela esgotada, preservando reserva de correção;
- `paused:kill_switch|stopped`: nenhuma invocação permitida.

## Instalação opcional no Windows

Primeiro conclua o dry-run. Em PowerShell no usuário atual:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/verah-os/windows-dispatcher.ps1 -Action Install
```

São criadas duas tarefas de privilégio limitado: inicialização no login e
watchdog a cada cinco minutos. A linha de comando contém apenas os caminhos do
pnpm e do repositório; não contém tokens nem variáveis. Não instale a partir de
uma branch ainda não revisada.

## Rollback e remoção

```text
pnpm verah:dispatcher:stop
```

```powershell
powershell -ExecutionPolicy Bypass -File scripts/verah-os/windows-dispatcher.ps1 -Action Uninstall
```

Isso preserva `.verah-os/`, checkpoint e evidências. Para impedir qualquer
retomada, mantenha o kill switch global ativo. Não apague mutex ou checkpoint
manualmente.

Para rollback de uma versão do dispatcher, solicite `stop`, confirme que o
processo terminou, restaure o código anterior e mantenha `.verah-os/` intacto.
O leitor preserva o snapshot anterior do estado, mas a fila, checkpoint, mutex
e labels não devem ser removidos à mão. Faça a reconciliação em dry-run antes
de retomar.

## Diagnóstico

- `dispatcher_disabled`: habilitação local ausente;
- `dispatcher_already_running`: outro processo vivo possui o mutex;
- `dispatcher_watchdog_stale_process_requires_operator_stop`: o PID ainda está
  vivo; pare e revise manualmente para evitar encerrar processo reutilizado;
- `dispatcher_codex_arguments_unsafe`: configuração tentou remover proteção;
- `ci_pending` ou `review_pending`: não reexecute nem selecione outra Issue;
- `rate_limit`, `quota` ou `authentication`: aguarde `nextAttemptAt`;
- `budget`: aguarde a nova janela, sem consumir a reserva do PR.

Logs sanitizados e rotacionados ficam em `.verah-os/audit.jsonl` e nunca devem
ser anexados a PRs. Nenhuma operação de produção ou banco remoto faz parte dos
comandos do dispatcher.
