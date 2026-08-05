# ADR 006 — Segunda opinião e orientação de movimentação

- Status: aceito para o Alpha da Issue #74
- Data: 2026-08-05
- Dependência: revisões e qualidade de proposta da Issue #73

## Contexto

Uma segunda opinião precisa preservar a proposta realmente revisada, separar
elegibilidade de resultado e impedir que uma orientação operacional seja
interpretada como diagnóstico ou confirmação de segurança veicular. Atualizar
um único registro de estado perderia a sequência de solicitação, aceite,
recusa, resultado e confirmação humana.

## Decisão

- `second_opinion_requests` vincula uma solicitação à revisão imutável, ao
  assessment de elegibilidade mais recente e ao prestador participante.
- `second_opinion_events` registra a sequência append-only `requested`,
  `accepted`/`declined` e `result_submitted`.
- Reentregas idênticas retornam o artefato existente; reutilização conflitante
  da chave idempotente falha de forma fechada.
- Solicitações e orientações recusam uma revisão que deixou de ser a mais
  recente da proposta.
- Resultados usam somente `supports_scope`, `questions_scope` ou
  `professional_assessment_required`; não representam diagnóstico.
- `vehicle_movement_guidance` aceita apenas `do_not_move`, `tow_recommended`
  ou `professional_assessment_required`, exige Concierge/Admin autenticado e
  grava confirmação humana.
- A mensagem para a cliente é gerada pelo banco a partir do código conservador.
  Texto livre interno nunca compõe essa mensagem.
- Eventos relevantes também entram na timeline existente de atendimento sem
  telefone, identidade comercial, evidência bruta ou notas internas.

## Autorização e projeções

- Customer não lê tabelas internas; RPCs retornam somente estado, timeline
  sanitizada e orientação conservadora do próprio atendimento.
- Provider lê apenas solicitações e eventos em que é o revisor participante;
  não recebe identidade da cliente, concorrentes nem justificativa interna de
  movimentação.
- Concierge/Admin auditam solicitações, eventos e orientações completas.
- `anon` e `service_role` não executam decisões humanas. Nenhum papel recebe
  escrita direta nas tabelas.
- Todas as tabelas usam RLS, grants mínimos e triggers de imutabilidade.

## Consequências e limites

O Alpha entrega fundação de dados e adapters server-side. Não seleciona
automaticamente prestador, não despacha guincho, não envia mensagens, não faz
pagamento, não altera valores e não afirma que um veículo pode circular.
Orientações anteriores deixam de ser publicadas como atuais quando surge nova
revisão da mesma proposta.

As migrations permanecem somente versionadas e testadas em ambiente local ou
efêmero; aplicação em produção exige um gate humano separado.
