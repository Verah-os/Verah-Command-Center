# #266 — nova regressão física Alpha

Base auditada: `main` em `98643910d9d08cbd8a0fe916969ab389e14d4712`.
PRs #267, #268 e #270 já mergeadas; #269 também está na ancestralidade.

## Evidência e reprodução

- `VehicleOnboardingStep.lookupPlate` apenas validava formato e carregava marcas FIPE. Não existia lookup de placa no provider: `vehicle-fipe-catalog` oferece somente brands/models/years/detail. Duas entradas conduziam ao mesmo catálogo. Removida a entrada redundante; a limitação aparece antes de qualquer consulta. O catálogo preenche os campos retornados após selecionar marca/modelo/ano, com confirmação humana antes do RPC canônico. Um único formulário manual atende entrada direta e fallback, preservando a placa e os dados disponíveis.
- Resposta HTTP 503 `provider_not_configured` chegava em `FunctionsHttpError.context`, tornando a mensagem específica inalcançável. O cliente agora decodifica esse envelope sem mostrar dados brutos do provedor; erro/timeout continua liberando o manual.
- `listConciergeServiceRequests` retornava `[]` em erro PostgREST. Agora propaga falha; a fila mostra erro e tentativa novamente, sem indicadores falsamente zerados.
- O web criava clientes SSR/browser/middleware sem aplicar o resolver canônico. Agora bloqueia outro projeto hospedado antes de qualquer request. Supabase local segue permitido para fixtures. A fila mostra project ref não secreto e permite atualização explícita.

Consulta **read-only**, restrita a `wxnklnbntgpcncajzpsj`, em 17/09/2026 UTC: uma row em `public.service_requests`, origem customer, etapa solicitado, criada em 00:49:44 UTC, com customer/vehicle/created_by presentes. Há somente um perfil customer e nenhum perfil concierge/admin nesse projeto. A policy de SELECT permite Concierge/Admin e mantém owner/provider scoped. As colunas consultadas e o RPC de lifecycle existem. Não foi feito INSERT/UPDATE, impersonação de usuário, mudança de perfil, migration ou consulta a produção.

Isso comprova persistência no Alpha, mas não comprova qual URL/configuração estava servindo a Central observada pelo usuário. Ausência de perfil Concierge/Admin impede um login Concierge canônico hoje; ambiente da Central precisa ser verificado pelo operador. Não reduzir RLS para contornar isso.

URL informada pelo usuário: `https://www.verah.app/concierge`. GET anônimo redirecionou para `/entrar/concierge`; oito scripts públicos inspecionados não expuseram o project ref. A configuração server-side continua não verificada; não inferir o projeto apenas pelo domínio.

## Validação repository-side

- Testes executam os handlers reais TSX com host React/Native sintético: catálogo normal preenche dados; erro/timeout → manual → controller canônico conclui primeiro veículo; detalhe incompleto não vira sucesso.
- Teste executa `createMobileServiceRequest` e `listConciergeServiceRequests` reais contra transporte sintético único, conferindo mesmo id, customer, vehicle, created_by, solicitado e requires_human_review; erros não viram fila vazia.
- RLS real permanece coberta em `supabase/tests/canonical_backend_environment.sql`, executada pela CI Database authorization (incremental e replay). O teste de transporte não substitui essa prova SQL.
- Nenhuma tabela, estado persistente paralelo, política ou migration adicionada/alterada.

## Human Gates mínimos (depois do PR verde e merge autorizado)

1. Operador confirma a URL da Central e configura seu ambiente Alpha para `NEXT_PUBLIC_SUPABASE_URL=https://wxnklnbntgpcncajzpsj.supabase.co` e `NEXT_PUBLIC_SUPABASE_ENVIRONMENT=alpha`, com a credencial pública correspondente gerenciada fora do Git. Publicação/configuração externa exige autorização separada; esta tarefa não a executa.
2. No mesmo projeto, provisionar **uma conta de teste separada do Cliente**, com perfil canônico `concierge` (identidade/perfil segundo o procedimento administrativo existente). Não converter o único customer, não conceder papel via metadata editável e não afrouxar RLS. O operador precisa escolher/autorizar essa conta; nenhum UUID foi inventado.
3. Com sessão Concierge desse projeto, abrir a fila e localizar o atendimento já persistido pelo reference_code exibido no app; conferir o mesmo id e vínculos. Não precisa criar outro atendimento para essa primeira verificação.
4. Catálogo: verificar se `vehicle-fipe-catalog` está publicado no Alpha e se o provider está configurado, sem expor nem alterar secrets nesta tarefa. Identificação automática **pela placa** exige uma fonte compatível, atualmente inexistente no contrato versionado; não é obtida ativando FIPE. O cadastro manual funciona independentemente desse gate.

Não solicitar nova APK antes de correções mergeadas e prontas. Signing/build física/publicação, mensagens, pagamentos, produção e migration repair/reset permanecem fora desta entrega.
