# Quote Quality & Comparison

## Fluxo Alpha

1. O prestador envia o orçamento pelo fluxo existente.
2. O banco preserva os cálculos atuais e captura uma revisão imutável.
3. Concierge/Admin registra um assessment de completude e qualidade.
4. Somente revisões prontas e comparáveis entram em um conjunto draft.
5. Um revisor humano publica o conjunto.
6. A cliente recebe uma projeção sanitizada com propostas anônimas.
7. A aprovação continua no fluxo existente e registra a revisão aprovada.

## Classificações

- `insufficient`: faltam informações essenciais.
- `weak`: há conteúdo, mas não sustenta decisão responsável.
- `usable_with_caveats`: pode orientar a operação com ressalvas explícitas.
- `comparison_ready`: escopo e detalhes permitem comparação responsável.
- `technically_confirmed`: exige confirmação humana de Concierge/Admin.

Nenhuma classificação representa certeza diagnóstica, autorização de reparo,
escolha de prestador ou declaração de que o veículo está seguro para circular.

## Comparabilidade

- mesmo atendimento;
- mesma chave de escopo técnico normalizada pelo revisor;
- mesmo escopo comercial;
- revisão imutável e assessment atual pronto;
- diferenças de peças, garantia, prazo e discriminação de preço visíveis;
- ordem humana justificada, nunca somente menor preço.

## Operação e limitações

- Catálogo e critérios exigem validação de especialistas automotivos.
- Customer não acessa tabelas internas nem identidade comercial de provider.
- Provider não acessa concorrentes.
- O Alpha não cria UI de comparação nem altera cálculos financeiros.
- Migrations são testadas apenas em Supabase local/efêmero com seed desabilitado.
