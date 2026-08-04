# ADR 003 — Revisões, qualidade e comparação de propostas

## Status

Aceito para o Alpha da Issue #73.

## Contexto

`service_quotes` e `service_quote_items` são o registro financeiro operacional
e possuem cálculos já validados. Sobrescrever esse registro ou comparar seu
estado mutável perderia a evidência apresentada à cliente. Comparar apenas o
menor preço também seria enganoso quando escopo, peças, mão de obra, garantia e
validade diferem.

## Decisão

1. Preservar integralmente as tabelas e cálculos financeiros existentes.
2. Capturar cada proposta submetida como `service_quote_revisions`, com número,
   snapshot JSON, SHA-256, autor, horário e chave de idempotência.
3. Tornar revisões e assessments append-only. Nova informação gera novo
   registro; não reescreve evidência anterior.
4. Exigir que toda aprovação registre `approved_revision_id`. A assinatura RPC
   antiga continua funcionando e escolhe a revisão mais recente sob lock; a RPC
   explícita rejeita revisão obsoleta.
5. Registrar qualidade em `quote_quality_assessments`. Os escores avaliam
   completude da proposta, não certeza do diagnóstico.
6. Permitir `technically_confirmed` somente quando Concierge/Admin autenticado
   é gravado como revisor humano.
7. Criar comparações bloqueadas por padrão, somente com revisões classificadas
   como `comparison_ready` ou `technically_confirmed`, mesma chave de escopo
   técnico normalizada e mesmo escopo comercial.
8. Preservar a ordem humana informada e rejeitar `lowest_price`, `price_only` e
   equivalentes como fundamento de ranking.
9. Cliente não lê tabelas internas. Uma RPC retorna somente comparação
   publicada e sanitizada, com rótulos “Proposta A”, “Proposta B” etc.
10. Provider lê somente suas próprias revisões e nunca vê assessments,
    conjuntos ou propostas concorrentes.

## Segurança e privacidade

- RLS em todas as tabelas e ausência de grants de escrita direta.
- RPCs `SECURITY DEFINER` usam `search_path = ''`, timeout curto, parâmetros
  validados, locks transacionais e grants explícitos.
- Eventos contêm somente identificadores técnicos e contagem; não incluem
  telefone, identidade comercial, notas técnicas ou payload completo.
- `service_role` é aceita apenas em RPCs server-side que não exigem decisão
  humana. Publicação e confirmação técnica exigem Concierge/Admin autenticado.

## Consequências

- Propostas anteriores à migration não recebem backfill automático. Ao serem
  aprovadas depois dela, o wrapper captura uma revisão antes da decisão.
- Mudança de escopo exige nova revisão/assessment; comparações incompatíveis
  falham fechadas.
- A UI de comparação pode ser adicionada depois usando a projeção sanitizada;
  este PR entrega a fundação de dados e serviços sem redesenhar portais.

## Rollback

Antes de uso em produção, rollback pode remover wrappers e objetos aditivos após
confirmar que nenhum `approved_revision_id` foi persistido. Depois de haver
aprovações referenciadas, o rollback preferido é migration reversa que restaura
as funções antigas e preserva tabelas/snapshots para auditoria. Restauração de
backup permanece a opção para falha transacional abrangente.
