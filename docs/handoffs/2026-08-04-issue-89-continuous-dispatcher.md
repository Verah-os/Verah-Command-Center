# Handoff — Issue #89 Continuous Dispatcher

## Estado

- base: `main` em `8dd37fb867d53a70e173be8eb0f3dbba17a6e28c`;
- branch: `feat/89-verah-os-continuous-dispatcher-execucao-continua`;
- PR: [#90](https://github.com/Verah-os/Verah-Command-Center/pull/90), aberto como draft;
- commits de implementação: `973bbbc` e `0cb626d`;
- dispatcher não instalado, não iniciado e desabilitado por padrão;
- nenhuma migration criada ou alterada;
- nenhuma mutation de produção ou banco remoto executada.

## Entrega

O dispatcher local reconcilia checkpoint, Issue, branch, PR, checks, revisão,
labels, lease e budgets antes de decidir por uma única invocação do Codex. A
fila é estritamente serial. Quota, rate limit, autenticação, conflito, CI ou
revisão pendentes, kill switch e budget causam pausa fail-closed. O runner não
persiste a saída bruta, remove variáveis externas sensíveis conhecidas e aceita
somente a sequência canônica de sandbox e aprovação.

Foram incluídos comandos locais de `start`, `stop`, `status` e `once`, estado
atômico, mutex, heartbeat, watchdog e instalação opcional de tarefas de usuário
no Windows. O script de instalação não foi executado nesta entrega.

## Validação

- testes focados do dispatcher: 18/18;
- suíte Node: 82/82;
- typecheck: aprovado;
- lint: aprovado, com um aviso preexistente de import `Wrench` não usado;
- Next.js build: aprovado;
- replay integral e incremental de migrations em Supabase local: aprovado;
- matriz SQL e schema lint: aprovados;
- parser do script PowerShell: aprovado;
- dry-run real da Issue #89: nenhuma invocação ou mutação externa;
- encadeamento sintético de duas Issues: serial e sem efeito externo.

## Limitações e ativação futura

O executável autenticado do Codex precisa ser confirmado no shell normal do
usuário antes de qualquer ativação. O ambiente isolado desta execução não
permitiu validar a chamada do executável distribuído pelo Windows; o adaptador
foi validado com processo sintético e argumentos canônicos. Isso não autoriza
ativação a partir desta branch.

Após revisão e eventual merge, o operador deve seguir
`docs/verah-os/dispatcher.md`: confirmar pré-requisitos, executar o dry-run,
revisar status e logs sanitizados e só então decidir separadamente pela
ativação. A instalação e a remoção das tarefas são reversíveis e não carregam
credenciais.

## Próximo passo

Revisar o diff e os checks do PR #90. Não retirar do draft, instalar tarefas,
habilitar o dispatcher ou fazer merge sem a decisão humana correspondente.
