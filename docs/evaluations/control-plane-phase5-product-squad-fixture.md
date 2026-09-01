# Fase 5 — fixture Design/Research/Product squad

- Data: 2026-09-01
- Ambiente: local, sandbox e dry-run
- Fonte canônica: Issue/context refs recebidos do GitHub

## Fluxo demonstrado

1. Research organiza somente evidências com referência canônica.
2. Design e Product recebem o brief de Research e contribuem em paralelo.
3. O Control Plane valida os três artefatos e agrega referências para o executor.
4. Ausência, erro, pendência, efeito externo ou decisão conflitante termina em
   `blocked` antes de qualquer executor ser consultado.

| Papel | Artefato da fixture | Autoridade |
|---|---|---|
| Research | `research_brief` com proveniência | organizar evidência |
| Design | `design_spec` isolado | propor experiência |
| Product | `product_plan` de uma entrega | definir aceite/escopo |

O squad não escolhe modelo ou executor, não escreve no GitHub/Supabase, não faz
merge e não inicia a próxima Issue. A fixture prova o contrato, não uma operação
real de modelos externos.
