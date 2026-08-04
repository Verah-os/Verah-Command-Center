# Política de autonomia

Uma invocação explícita executa no máximo uma issue. São necessários
`codex:authorized` e `codex:ready`; `codex:blocked` exclui a issue e qualquer
`codex:in-progress` bloqueia uma nova seleção.

O ciclo pode ler contexto, reservar a issue, criar branch, editar o escopo,
testar, fazer commits, abrir um PR draft e atualizar registros sanitizados.
Existem no máximo duas tentativas automáticas de correção.

Escopo novo, credenciais, custos, produção, banco remoto, mensagens reais,
pagamentos, regras financeiras e rulesets permanecem gates humanos. O modo
unattended não converte aprovação de produto em autorização operacional para
esses atos.
