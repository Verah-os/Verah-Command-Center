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

## Windows

Para recuperação assistida no login, crie opcionalmente uma tarefa do Agendador de Tarefas no usuário atual que execute, no diretório do repositório:

```text
pnpm verah:recover:dry-run
```

Não armazene tokens ou variáveis sensíveis na tarefa. Não configure `continue`, merge ou comandos de produção no login. Depois de reiniciar, revise `verah:health` e invoque `$verah-os-unattended` para qualquer mutação.

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
- `host_lock_occupied`: aguarde a expiração ou o processo proprietário;
- owner divergente: mantenha a Issue bloqueada e peça revisão humana;
- worktree sujo: preserve as mudanças e resolva sua origem antes de recuperar;
- budget vencido: inicie outro ciclo somente com nova autorização.

Produção, migrations remotas, `db push`, `migration repair`, mensagens reais, pagamentos e alterações de ruleset continuam proibidos.
