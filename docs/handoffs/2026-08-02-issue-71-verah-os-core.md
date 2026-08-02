# Handoff — Issue #71 VERAH OS Core

Data: 2026-08-02

## Estado

- Base: `7204fd5fb28477009eba1e1ce50e063e3ef311aa`.
- Branch: `feat/71-verah-os-core`.
- Issue #71: autorizada, pronta e em andamento.
- PR #68: mesclado; Issue #67 encerrada.
- Skill supervisionada `verah-autonomous-delivery`: preservada sem alteração.
- Skill `verah-os-unattended`: criada separadamente e com invocação implícita desabilitada.
- Produção e Supabase remoto: não acessados ou alterados.
- Deploy to production do Supabase: não reativado.
- PR #70: não modificado.

## Escopo entregue

- seleção determinística de uma issue autorizada por ciclo;
- allowlist do mantenedor autenticado no GitHub;
- mutex local atômico com lease;
- checkpoint mínimo e retomada idempotente;
- kill switch fail-safe;
- budget de duração e limite fixo de duas correções;
- gates de release com opt-in `codex:auto-merge`;
- comandos `verah:continue`, `verah:status`, `verah:dry-run`, `verah:stop` e `verah:resume`;
- skill, políticas, templates, documentação e testes.

Não há migration nova. As tabelas, máquina de estados, locks e budgets do
Control Plane 001 não foram duplicados.

## Validação

- 45/45 testes Node aprovados, incluindo 12 do VERAH OS Core;
- typecheck aprovado;
- lint aprovado com um warning preexistente de `Wrench` fora do escopo;
- Next.js build aprovado;
- replay incremental das migrations aprovado com fixture sintética;
- replay integral de 31/31 migrations com `--no-seed` aprovado;
- matrizes SQL e concorrência aprovadas;
- schema lint de `public,private` sem erros;
- skill validada estruturalmente; o script oficial foi tentado, mas o runtime
  local não contém PyYAML, portanto a mesma matriz de nome, frontmatter,
  descrição e metadata foi verificada sem instalar dependências.

Uma tentativa de correção foi usada: o teste de retomada foi ajustado de um
instante exatamente expirado para um instante dentro da lease. A regra de
timeout permaneceu fail-closed.

## Limitações e riscos

- o bootstrap usa mutex/checkpoint do host e label do GitHub; a RPC do Control
  Plane somente poderá ser conectada após implantação autorizada separadamente;
- a operação unattended deve permanecer em um único host até existir lock
  canônico implantado;
- `continue` reserva e registra o ciclo, enquanto a skill executa o trabalho;
- auto-merge exige label humano específico e todos os checks, mas a Issue #71
  não recebeu esse label e este PR não deve ser mesclado nesta execução;
- nenhuma automação recorrente foi ativada antes de a skill existir na `main`.

## Próximo passo

Revisar o PR draft da Issue #71 e seus checks. Após eventual merge autorizado,
instalar/recarregar a skill na cópia ativa do Codex e configurar uma automação
local inicialmente pausada, começando por um ciclo dry-run.
