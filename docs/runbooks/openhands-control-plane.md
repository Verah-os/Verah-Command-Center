# OpenHands no VERAH AI Control Plane

## Estado suportado

O core seleciona `OpenHandsExecutor` explicitamente pelo contrato
`AgentExecutor`. O adapter oferece readiness, timeout preemptivo, cancelamento,
normalização de status, custo/duração opcionais e logs sanitizados. O
transporte é injetável e o CI usa fixture; nenhuma credencial ou serviço
OpenHands é necessário para os testes.

O transporte real permanece **desabilitado até o ambiente satisfazer este
runbook**. O modo headless oficial aprova ações automaticamente, portanto não
deve ser executado diretamente no checkout, perfil de usuário ou rede de
produção da VERAH.

## Instalação isolada

1. Crie um usuário/contêiner efêmero exclusivo, sem acesso a produção,
   credenciais VERAH, Docker socket do host ou diretórios fora do workspace.
2. No Windows, execute dentro do WSL; a CLI não oferece suporte nativo.
3. Instale uma versão revisada e pinada com Python 3.12 e `uv`, por exemplo
   `uv tool install openhands==<versao-revisada> --python 3.12`.
4. Mantenha configuração/segredos no secret store do ambiente isolado. Nunca
   use `.env` versionado e nunca encaminhe secrets para logs do Control Plane.
5. Prepare um worktree novo a partir de `main` atualizado e uma branch
   exclusiva `agent/openhands/issue-<numero>`. Um lease VERAH deve existir
   antes de iniciar o transporte.
6. O transporte deve implementar `OpenHandsTransport`, consultar `/health`
   quando usar Agent Server e executar somente com `integrationSafe: true`.
7. Restrinja rede de saída, limite CPU/memória/tempo e permita escrita apenas
   no worktree. Draft PR/handoff é o limite da execução; merge/deploy/migration
   remota continuam em gate humano.

## Readiness e estados

| OpenHands | `AgentExecutor` |
|---|---|
| ready | available |
| busy | busy |
| offline/erro/timeout | unavailable |
| quota/HTTP 429 | rate_limited |

Se readiness não for `available`, o core não chama modelo/memória/execução e
libera o lease. Timeout ou cancelamento retornam falha recuperável e solicitam
cancelamento ao transporte, mesmo quando ele ignora `AbortSignal`.

## Checklist de ativação

- fixture e testes do adapter verdes;
- imagem/pacote OpenHands pinado e revisado;
- workspace efêmero e branch exclusiva comprovados;
- nenhuma credencial VERAH visível no processo;
- egress negado ou allowlist explícita;
- kill switch testado;
- logs verificados sem tokens, e-mails ou telefones;
- tarefa piloto pequena termina em Draft PR sem efeitos externos.

Referências oficiais: https://docs.openhands.dev/openhands/usage/cli/headless,
https://docs.openhands.dev/openhands/usage/cli/installation e
https://docs.openhands.dev/sdk/guides/agent-server/api-reference/server-details/health.
