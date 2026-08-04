# ADR 004 — Resiliência local do VERAH OS

- Status: aceito para Alpha
- Data: 2026-08-04
- Issue: #87

## Contexto

O controlador unattended roda em um único computador. Uma interrupção pode remover o processo, mas deixar um checkpoint, lease, branch remota, PR ou o lock `codex:in-progress`. A retomada precisa reconciliar essas fontes sem repetir efeitos.

## Decisão

O checkpoint local continua sendo o estado resumível do host e passa à versão 3. Escritas são atômicas e preservam uma cópia anterior. O GitHub permanece como lock operacional e fonte de branches e PRs; o Control Plane existente continua sendo o modelo canônico, sem nova persistência.

`pnpm verah:continue` recupera, nesta ordem:

1. checkpoint local válido;
2. PR aberto já existente;
3. Issue com `codex:in-progress`, somente quando a reserva mais recente pertence ao mantenedor autenticado;
4. nova Issue autorizada.

Na terceira opção, o controlador faz apenas leituras do workspace e do GitHub. Uma branch remota existente leva ao estado `testing`; uma branch apenas local leva a `implementing`; ausência de ambas retorna a `planning`. Worktree sujo, dono divergente, budget expirado ou estado ilegível falham fechados.

## Saúde e auditoria

O status executivo usa `running`, `interrupted`, `recovering`, `blocked` e `idle`. O comando `verah:health` informa checkpoint, lease e condição do workspace sem imprimir variáveis ou credenciais. Eventos locais usam JSONL sanitizado, permissão restrita e rotação simples; `.verah-os/` permanece ignorado pelo Git.

## Inicialização opcional

O login do Windows pode chamar `pnpm verah:recover:dry-run` por uma tarefa configurada manualmente. Continuação mutável exige ambiente explicitamente habilitado e invocação da Skill. Nenhum segredo é gravado na tarefa ou no repositório.

## Consequências

- reinícios não criam outra Issue, branch, commit ou PR;
- lease válido continua impedindo concorrência e lease expirado pode ser retomado;
- o kill switch sempre prevalece;
- não há execução em múltiplas máquinas nem garantia enquanto o computador estiver desligado;
- nenhuma operação de produção, banco remoto, mensagem ou pagamento é adicionada.
