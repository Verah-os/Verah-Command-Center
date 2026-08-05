# Segunda opinião e movimentação do veículo

## Fluxo Alpha

1. Concierge/Admin confirma que o assessment mais recente marcou a revisão
   imutável como elegível.
2. A solicitação identifica um prestador ativo diferente do autor da proposta.
3. O prestador participante aceita ou recusa; recusa exige justificativa.
4. Após o aceite, o prestador registra um resultado não diagnóstico.
5. Concierge/Admin pode confirmar uma orientação conservadora de movimentação.
6. A cliente consulta somente estado e mensagem sanitizados; operações mantêm
   a trilha completa.

## Orientações permitidas

- `do_not_move`: não movimentar e aguardar profissional qualificado;
- `tow_recommended`: não conduzir e confirmar transporte adequado, com guincho
  recomendado;
- `professional_assessment_required`: exigir avaliação profissional presencial
  antes de qualquer movimentação.

Nenhuma orientação significa que o veículo está seguro, autoriza circulação,
confirma diagnóstico ou substitui avaliação presencial.

## Garantias

- revisão e assessment específicos, sem resolução implícita para dados mutáveis;
- rejeição de revisão obsoleta;
- deduplicação transacional e verificação de colisão idempotente;
- estados e orientações append-only;
- confirmação humana obrigatória para movimentação;
- Customer sem tabelas internas ou identidade de prestador;
- Provider limitado à própria participação;
- Concierge/Admin com auditoria integral;
- textos livres limitados e recusados quando parecem conter contato ou segredo.

## Fora do escopo

Não há diagnóstico autônomo, escolha automática de prestador, guincho real,
despacho, integração externa, mensagem real, pagamento, mudança financeira ou
operação de banco remoto.
