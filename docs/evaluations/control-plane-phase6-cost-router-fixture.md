# Avaliação da Fase 6 — Cost Router / OmniRoute

- Data: 2026-09-01
- Escopo: fixture local, sem rede e sem credenciais
- Evidência OmniRoute: `pocs/omniroute/out/omniroute-evaluation.json`
- Snapshot fixado: `63e4afa3217abaacd29f85c6701064671925764b`

## Decisão

**OmniRoute permanece `TRIAL` e desabilitado no runtime.** A matriz versionada
passou 15 de 27 cenários. O fallback prioritário canônico falhou e o overhead no
alvo de implantação ainda não foi medido. Esses resultados não satisfazem o
gate de adoção definido no ADR-008.

O Control Plane usa o `CostAwareModelRouter` interno. Ele ordena candidatos por
custo estimado, usa prioridade como desempate, verifica disponibilidade e avança
para o próximo candidato sem trocar papel ou executor. Ausência de candidato
elegível ou disponível falha fechada.

## Gate de adoção

OmniRoute só é chamado quando toda a evidência abaixo é verdadeira:

1. decisão explícita `ADOPT`;
2. snapshot Git completo de 40 caracteres;
3. matriz canônica integralmente verde;
4. fallback canônico aprovado;
5. overhead medido no alvo de implantação.

Configuração parcial, rota malformada ou erro do adapter não elimina o fallback
interno. Mensagens do provedor não são copiadas para a justificativa auditável.

## Evidência da fixture

- `TRIAL` não invoca o adapter OmniRoute;
- menor custo disponível é selecionado deterministicamente;
- rate limit/indisponibilidade avança para o próximo candidato;
- filtros de papel e tipo de tarefa são fail-closed;
- todos os requisitos de adoção são testados separadamente;
- adapter aprovado, porém inválido ou indisponível, retorna ao router interno;
- custos inválidos e identidades duplicadas são rejeitados na construção.

Esta fixture prova o contrato e o gate, não operação com modelos ou provedores
reais.
