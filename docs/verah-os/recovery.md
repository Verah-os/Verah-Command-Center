# Recuperação local do VERAH OS

## Sequência segura

Use Node.js 22.17.1 e pnpm 9.15.9.

```text
pnpm verah:health
pnpm verah:recover:dry-run
pnpm verah:recover
pnpm verah:heartbeat
```

`recover:dry-run` não grava checkpoint nem altera o GitHub. `recover` é um alias explícito de `continue`: exige unattended habilitado, kill switch desativado e mantenedor em allowlist. Ele reutiliza checkpoint, PR ou reserva existente antes de selecionar trabalho novo.

Estados executivos:

- `running`: checkpoint com lease vigente;
- `interrupted`: checkpoint ou lock operacional sem lease vigente;
- `recovering`: reconciliação segura em andamento;
- `blocked`: kill switch, owner divergente, worktree sujo, budget vencido ou estado inválido;
- `idle`: nenhum ciclo ativo.

O status do dispatcher detalha ainda `queued`, `waiting_budget`,
`waiting_quota`, `waiting_rate_limit`, `waiting_authentication` e `resuming`.
Esses estados preservam o item de fila, `nextAttemptAt`, consumo da janela e
capacidade de correção reservada. Após a janela ou o backoff expirar, o loop
retoma o mesmo checkpoint; não execute `continue` manualmente nem remova locks.

O checkpoint v4 inclui expiração do lease, branch/head observado, limpeza do
worktree, motivo da pausa e `nextAttemptAt`. Em resume, o branch do checkpoint
é reconstruído a partir do SHA base quando ausente. Se mudanças da Issue ativa
estiverem no branch anterior, um stash por SHA preserva o backup antes da troca
e da reaplicação. `host_lock_expired` e lock ausente são estados recuperáveis;
owner divergente continua falhando fechado.

## Windows

O dispatcher contínuo oferece instalação opcional de duas tarefas no usuário
atual: início no login e watchdog. Ambas executam somente
`pnpm verah:dispatcher:start`, sem credenciais ou variáveis na linha de comando.
O dispatcher continua desabilitado e em dry-run por padrão e preserva todos os
gates da Skill. Consulte `docs/verah-os/dispatcher.md` para instalar, validar e
remover. Não configure comandos de produção no login.

## Energia, tampa, Docker e rede

- configure a tampa e suspensão conforme a janela de trabalho; o controlador não impede suspensão;
- Docker é necessário somente para testes locais de banco e não para health/dry-run;
- perda de rede deixa o ciclo interrompido; não repita commits ou pushes manualmente antes da reconciliação;
- após retorno da rede, execute health, dry-run e recover nessa ordem;
- o lease expira de forma segura; não remova `host.lock` manualmente.

## Logs e privacidade

Os arquivos locais ficam em `.verah-os/`, ignorados pelo Git. `audit.jsonl` contém somente evento, horário, números operacionais, branch, estado e detalhe sanitizado. Há uma rotação para `audit.previous.jsonl`. Não anexe essa pasta a issues ou PRs.

## Diagnóstico

- `checkpoint_unreadable`: preserve os arquivos locais e pare; não recrie trabalho;
- `host_lock_expired`: o dispatcher reconstrói o lease e continua o checkpoint;
- `host_lock_occupied`: aguarde a expiração ou o processo proprietário;
- owner divergente: mantenha a Issue bloqueada e peça revisão humana;
- worktree sujo no branch anterior: o dispatcher cria backup por SHA e move o
  working state somente para o branch do checkpoint;
- budget vencido: inicie outro ciclo somente com nova autorização.

Produção, migrations remotas, `db push`, `migration repair`, mensagens reais, pagamentos e alterações de ruleset continuam proibidos.
