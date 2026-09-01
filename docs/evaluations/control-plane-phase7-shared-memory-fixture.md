# Avaliação da Fase 7 — Shared Agent Memory / Cognee

- Data: 2026-09-01
- Escopo: fixture local, sem rede, LLM ou credenciais
- Evidência Cognee: ADR-008 / POC da Issue #152
- Versão avaliada: `1.5.3`

## Decisão

**Cognee permanece `TRIAL` e desabilitado no runtime.** O POC determinístico
atingiu 3/3 e comprovou recuperação entre processos, mas provenance é opt-in e
TTL não é nativo. Isso ainda não satisfaz o gate de adoção da memória.

O `GatedSharedAgentMemory` implementa o contrato `AgentMemory` com catálogo
curado interno. GitHub, Supabase e arquivos versionados continuam canônicos. A
memória só carrega referências explícitas da tarefa, verifica digest e versão,
aplica expiração, revogação e supersession e marca o conteúdo como dado não
confiável.

## Limite do índice semântico

Quando uma evidência futura aprovar Cognee, o backend poderá retornar somente
localizadores (`id`, origem, versão e digest). O conteúdo entregue ao executor
sempre vem do catálogo curado; localizadores fabricados, obsoletos ou divergentes
são ignorados. Erro do backend retorna ao lookup determinístico.

## Evidência da fixture

- estado `TRIAL` produz zero chamada ao Cognee;
- referências não explícitas não carregam contexto;
- TTL, revogação e supersession removem contexto obsoleto;
- índice aprovado ordena apenas registros canônicos válidos;
- falha do índice preserva fallback interno;
- conteúdo é limitado, marcado como não confiável e redigido;
- registros com digest, data, TTL ou supersession inválidos são rejeitados;
- cada condição do gate Cognee possui regressão independente.

Esta fixture prova o boundary e a política de memória. Não representa Cognee,
LLM, embeddings ou persistência externa em operação real.
