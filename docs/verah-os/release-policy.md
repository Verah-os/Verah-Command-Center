# Política de release

O release automático é opt-in por issue com `codex:auto-merge`. Sem esse label,
o ciclo termina no PR draft revisado.

Antes do squash merge, exigir simultaneamente:

- PR aberto, Ready, CLEAN e mergeável;
- zero commits atrás da `main`;
- zero threads pendentes ou reviews pedindo mudanças;
- diff e secret scan aprovados;
- CI / Application, CI / Database authorization, CI / Required e Vercel em
  sucesso;
- nenhuma ação remota de banco ou produção;
- handoff e descrição atualizados.

Depois do merge, validar CI e Vercel no SHA da `main`, excluir somente a branch
mesclada, encerrar a issue e liberar o lock. Falha em qualquer gate interrompe
o release sem bypass.
