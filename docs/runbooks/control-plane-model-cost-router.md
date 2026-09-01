# Runbook — Model Cost Router

## Estado seguro padrão

Use `CostAwareModelRouter` com candidatos internos versionados. Sem evidência
explícita, ele aplica `OMNIROUTE_PHASE_0_EVIDENCE`, cujo estado é `TRIAL`; por
isso o adapter externo não é chamado.

Cada candidato declara provedor, modelo, prioridade e custo estimado em
microunidades. Restrições opcionais de papel e tipo de tarefa reduzem a lista
elegível. A seleção é menor custo, menor prioridade e identidade como desempate
determinístico.

## Observabilidade

A rota interna inclui `estimatedCostMicrounits` e `fallbackCount`. Consulte
`omniRouteGate()` para registrar se o adapter está habilitado e qual requisito
impediu sua adoção. Não registre erros crus de provedores ou credenciais.

## Falhas e fallback

- `rate_limited`, `busy`, `unavailable` ou erro na sondagem: tenta o próximo;
- nenhum candidato elegível: `model_route_not_eligible`;
- nenhum candidato disponível: `model_route_unavailable`;
- OmniRoute aprovado mas com erro ou resposta malformada: fallback interno;
- gate incompleto: OmniRoute não é chamado.

Esses erros devem permanecer recuperáveis no Control Plane. Não libere uma rota
externa alterando apenas a decisão: gere nova evidência versionada, revise o
snapshot e confirme todos os requisitos do gate.
