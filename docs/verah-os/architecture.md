# Arquitetura do VERAH OS Core

## Componentes

- GitHub Issues: fila, autorização e lock operacional visível.
- Control Plane 001: modelo persistente canônico para work items, runs, eventos,
  locks, approvals e budgets; não é duplicado por esta entrega.
- Controlador local: seleção determinística, mutex do host, checkpoint mínimo,
  stop/resume e relatório sem efeitos de produção.
- Skill unattended: agente que executa a entrega e respeita gates.
- GitHub PR + CI + Vercel: revisão e release verificável.

```text
issue autorizada
  -> dry-run de seleção
  -> mutex local + codex:in-progress
  -> branch isolada
  -> implementação e validação local
  -> PR draft + CI/Vercel
  -> revisão e gates
  -> squash merge somente com codex:auto-merge
  -> validação da main e próximo ciclo
```

## Estado e idempotência

O checkpoint local contém somente issue, run, branch, SHA, estado, tentativas,
heads observados e timestamps. Escritas atômicas preservam o snapshot anterior.
Ele permite retomada no mesmo host, mas não substitui o Control
Plane. O mutex é criado atomicamente, possui expiração e permanece retido
durante o ciclo. Heartbeats renovam a lease; uma segunda invocação falha
fechada enquanto ela estiver vigente. Após expiração, o mesmo checkpoint pode
ser retomado com uma nova lease dentro do budget total. O label
`codex:in-progress` impede sobreposição operacional entre ciclos. Se o
checkpoint se perder, a reserva do GitHub só é reconciliada quando pertence ao
mantenedor autenticado e o workspace está limpo. Um run retomado reutiliza seu
checkpoint e não reserva outra issue.

## Limite do bootstrap

Como a migration do Control Plane não é aplicada por esta entrega, o comando
local não grava no banco remoto. A integração com a RPC existente é uma etapa
posterior e depende de autorização de implantação separada. Até lá, a automação
deve rodar em um único host e manter o mutex local e o lock visível no GitHub.
