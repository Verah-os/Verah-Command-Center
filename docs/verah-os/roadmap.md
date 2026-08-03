# Roadmap do VERAH OS

## Core — esta entrega

- skill unattended separada;
- seleção determinística de uma issue;
- mutex local e lock operacional;
- checkpoint e retomada;
- kill switch;
- budgets e duas tentativas;
- gates de release;
- comandos locais, documentação e testes.

## Próxima etapa

- Control Plane 002 read-only: comprovar autorização e estado diretamente no
  GitHub com credenciais de menor privilégio.
- Adaptar o controlador à RPC existente quando houver implantação autorizada.
- Ativar uma automação local primeiro em dry-run.

## Posterior

- observabilidade centralizada de custos e leases;
- múltiplos hosts com lock canônico;
- notificações internas;
- continuidade entre ciclos sem ampliar permissões de produção.

Intake Inteligente e Quote Intelligence permanecem fluxos de produto separados.
