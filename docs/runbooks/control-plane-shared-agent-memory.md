# Runbook — Shared Agent Memory

## Estado seguro padrão

Construa `GatedSharedAgentMemory` com registros derivados de GitHub, Supabase ou
arquivos versionados. Cada registro precisa de origem, versão, SHA-256,
`observedAt`, status e conteúdo limitado. A tarefa precisa listar a origem em
`contextRefs`; ausência de referência retorna contexto vazio.

Sem evidência explícita, aplica-se `COGNEE_PHASE_0_EVIDENCE`, cujo estado é
`TRIAL`. O backend Cognee não é chamado.

## Atualização e invalidação

- novo conteúdo da mesma origem deve declarar `supersedesId`;
- contexto temporário deve declarar `expiresAt`;
- conteúdo retirado deve usar `status: revoked`;
- digest divergente bloqueia o catálogo na inicialização;
- uma versão nova ou expirada nunca faz a versão anterior reaparecer.

## Segurança

O índice semântico não é fonte de conteúdo. Mesmo quando aprovado, aceite apenas
localizadores que correspondam exatamente a um registro ativo do catálogo.
Nunca envie texto retornado pelo índice diretamente ao executor. Erros do
backend não devem entrar em contexto, logs ou auditoria.

Antes de mudar Cognee para `ADOPT`, confirme versão pinada, pipeline
determinístico, precisão cross-session integral, provenance registrado, TTL do
adapter testado e extração de grafo/LLM desabilitada.
