# CRM Leads V0 — arquitetura canônica e plano de conversão Lead → Cliente

> Escopo: documentação/arquitetura somente. Nenhuma migration
> nova, schema, identidade paralela, ingestão real de canal externo, endpoint
> ou código de UI é criado nesta entrega. Issue #238 · Ref #231 · EPIC #164.

## 1. Objetivo e limites

Documentar a arquitetura canônica de **Leads → Cliente → Veículo → service_request**
para o Command Center, reutilizando exclusivamente os contratos já existentes no
backend VERAH e preservando RLS, autorização, auditabilidade e fail-closed.


Nesta V0 **não** se entrega:

- schema novo, migration local ou remota, nem `db push`/repair/reconciliation;
- identidade de cliente paralela nem "CRM" separado do backend canônico;

- ingestão real de leads de conteúdo, Instagram, WhatsApp, parceiros ou outros
  canais (entrada real de canal continua somente pelos caminhos já aprovados)::
  - WhatsApp: webhook idempotente canalizado por
    `persist_whatsapp_inbound_message_safe` (migration `20260826193000`)
    e fila de identidade pendente `whatsapp_unbound_contacts/messages`;
  - App: onboarding canônico de cliente autenticada;

- mensageria, pagamento, App ID/signing/submission/publicação, produção/deploy,
  secrets ou merge automático.

O que **é** entregue: o modelo conceitual de funil, a matriz de dados mínimos
e PII, as regras deduplicação/binding fail-closed, o plano de métricas atuais vs
futuras, a especificação de UI futura sem implementação e o plano incremental em
subissues seguras com dependências e gates humanos.



## 2. Fontes futuras de lead e camada de intake controlada

| Origem futura | Intake controlado (futuro) | Estado mínimo persistido (futuro) | Binding à identidade canônica |
| ------------ | ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------ |
| Conteúdo (blog, e-book, materiais) | formulário/landing com consentimento e origem | intenção declarada (lead inbound|) | somente por ação humana segura + confirmação de canal |
| Instagram (DM/contato) | entrada de canal validada, sem scraping | contato originado do canal (endereço de canal privado) | somente por binding humano a `customer_channels` |
| WhatsApp | **já existe hoje**: `persist_whatsapp_inbound_message_safe` → `whatsapp_unbound_contacts` | `pending_identity` → `bound` → `blocked` | exclusivamente por `bind_whatsapp_unbound_contact` (Concierge/Admin, humano) |
| Parceiros (indicação, revenda, API B2B) | contrato futuro de importação com provenance explícita | lead importado com origem/provenance e consentimento | somente com evidência, autorização e revisão humana |
| Outros (eventos, telefone avulso, papel) | triagem regulada, nunca inserção direta de PII em `customers` | lead com origem e proveniência rastreadas | somente por fluxo humano canônico |

Princípio da camada de intake: **nenhuma origem externa escreve direto na
identidade canônica**. Toda entrada entra primeiro em um estado controlado (filia/estado
pendente com `origin` e `idempotency_key`), passa por validação de canal e
consentimento, e só então pode ser vinculada à identidade canônica por um ator
humano autorizado (Concierge/Admin), usando os primitives existentes expostos na
Seção 4. Fontes externas são **canais**; a Plataforma VERAH permanece a única
fonte da verdade (ADR 001, WhatsApp Channel Architecture, Product Principles #2,e #3).

## 3. Modelo conceitual de estados do funil

Estados conceituais do funil `Lead → Qualificado → Conversão pendente → Cliente
vinculado → Veículo → Solicitação`, separando o que é derivável hoje (com os
contratos atuais e sem inventar dado) do que exige estado/schema futuro.



| Estado conceitual | Definição | Derivável hoje? | Fonte canônica atual / futura |
| -------------------- | ---------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------- |
| **Lead** | intenção/contato inicial ainda sem identidade vinculada | parcial | hoje: `whatsapp_unbound_contacts`/`whatsapp_unbound_messages` (WhatsApp não vinculado); futuro: camada de intake das demais origens |
| **Qualificado** | lead com dados suficientes e consentimento para avançar à conversão | parcial | hoje: atributos mínimos e `consent_status` em `customer_channels`; futuro: estados explícitos da camada de lead |
| **Conversão pendente** | identidade canônica criada/reutilizada e canal vinculado, aguardando confirmação segura | sim (WhatsApp) | `customers` + `customer_channels` (via `bind_whatsapp_unbound_contact`/RPCs de identidade) |
| **Cliente vinculado** | identidade canônica com canal/canal primário e consentimento rastreado | sim | `customers`, `customer_channels`, `identity_relations` (candidato→active) |
| **Veículo** | veículo confirmado pela própria cliente | sim (App/onboarding e intake inteligente) | `customer_vehicles` com `customer_confirmed_at` (`data_source='customer_confirmed'`) |
| **Solicitação** | `service_request` canônico vinculado à identidade | sim | `service_requests.customer_id` + `vehicle_id` + `intake_session_id` (migration `20260905001000` e `20260802013920`) |

Observações de honestidade de dados:

- "Cliente ativo" não é um estado persistido novo; é derivado de
  `service_requests` nas cinco etapas abertas (`solicitado`, `concierge_aceitou`,
  `prestador_indicado`, `aguardando_aprovacao`, `em_execucao`) concentradas por
  `customer_id` — como já documentado na fatia V1 (#235/#236),sem inventar
  memória de estado paralela.
- Conversão lead → cliente só pode ser declarada quando houver uma função/evento
  canônico auditável que comprove o vínculo (hoje: `bind_whatsapp_unbound_contact`
  registra `resolved_by`/`resolved_at`; no futuro, o evento correspondente da
  camada de lead). Sem isso, o dado fica indisponível/futuro, nunca inferido.


## 4. Contratos atuais reutilizáveis (única fonte da verdade)

Contratos validados contra o código atual da `main` (migrations versionadas neste
repositório). Nenhuma entidade abaixo é criada nesta issue; todas já existem.



| Entidade canônica | Migration de origem | Papel no funil | Vínculo usado pelo CRM |
| ----------------------------- | ------------------------------------------------------------ | -------------------------------------------- | ---------------------------------------------- |
| `customers` | `20260730150101_customer_identity_foundation` | identidade canônica da cliente | `id`; `auth_user_id` opcional e único |
| `customer_channels` | `20260730150101_...`, `20260826193000_whatsapp_production_readiness` | endereço de canal (E.164 para WhatsApp), consentimento | `customer_id`; `channel_type`/`channel_address`; `is_primary`; `consent_status`/`consent_source` |
| `service_conversations` | `20260731022348_alpha_communication_intake_foundation` | conversa por canal vinculada à identidade | `customer_id`; `customer_channel_id`; `channel_type` |
| `whatsapp_unbound_contacts` / `whatsapp_unbound_messages` | `20260826193000_whatsapp_production_readiness` | fila de identidade pendente (lead WhatsApp sem vínculo) | `channel_address`; `status` (`pending_identity`→`bound`→`blocked`; mensagens imutáveis em `pending`→`bound` |
| `customer_vehicles` | `20260716000000_create_customer_vehicles`, `20260802013920_alpha_intelligent_intake_foundation`, `20260827040000_vehicle_onboarding` | veículo confirmado pela cliente | `customer_id` (ou `owner_id` legado;; `customer_confirmed_at`, `data_source` |
| `service_requests` | `20260712000000_create_service_requests`, `20260715000000_concierge_lifecycle`, `20260802013920_...`, `20260905001000_canonical_service_request_customer_identity` | solicitação canônica | `customer_id`; `vehicle_id`; `intake_session_id`; `origin` (`customer`/`concierge`/`whatsapp`); `service_stage`; `created_by` |
| `service_request_events` | `20260731022348_alpha_communication_intake_foundation` | histórico operacional auditável | `service_request_id`; `event_type`; `actor_role`; `channel`; `audience`; `payload` |
| `intake_sessions` / `intake_assessments` | `20260802013920_alpha_intelligent_intake_foundation` | intake inteligente da jornada WhatsApp | `customer_id`, `vehicle_id`, `service_request_id`; `status`/`current_step`; `correlation_id` |
| `verah_identities` / `identity_relations` / `identity_onboarding` | `20260827013000_identity_onboarding_foundation` | identidade de login e relação com papéis | `identity_relations(customer_id)` com `relation_status` (`candidate`/`active`/...) |
| `user_profiles` | `20260712210000_create_user_profiles` | RBAC (papel e escopo) | `role` (`customer`,`concierge`,`provider`,`admin`); `provider_id` |

## 5. Regras de deduplicação e binding (fail-closed)

1. **Nunca criar cliente por telefone ou nome isoladamente.** Telefone, e-mail
   ou nome não são chave de identidade canônica. O único resoledor por canal que
   já existe é `resolve_or_create_whatsapp_customer`, restrito a `service_role`,e ele
   resolve **pelo endereço E.164 do canal já persistido** — nunca por nome/nome+telefone.

2. **Reutilizar primitives canônicos existentes quando aplicável:**
   identity/customer (`customers`, `customer_channels`, `identity_relations`), veículos
   (`customer_vehicles`), solicitações (`service_requests`) e eventos
   (`service_request_events`). Não criar tabelas CRM, projeções paralelas, nem
   new state machine de domínio.


3. **Binding de canal WhatsApp já é humano e auditável:** `bind_whatsapp_unbound_contact`
   exige papel `concierge`/`admin`, atribui `resolved_by`/`resolved_at`, lida com colisão
   por `channel_type+channel_address` único e impede ligar um canal já vinculado a outra
   identidade (`23505`). Reutilize esse contrato; não crie um segundo mecanismo
   de binding para as demais origens. Para origens futuras, especificar um
   primitive análogo com requisitos de evidência, autorização e auditoria.



4. **Conflitos exigem ação humana segura.** Quando dois leads/canais apontarem para
   a mesma identidade, ou um canal pertencer a outra cliente, o sistema **não**
   resolve silenciosamente: bloqueia (erro `23505` no contrato existente) e expõe o
   conflito para revisão humana em superfície autorizada. Não existe merge automático
   de identidades.(ADR 001: "A resolução e criação idempotente pelos comandos
   acima não representa merge automático de identidades conflitantes.")



5. **Nunca associar `service_request` por nome, telefone ou `created_by` sozinho** quando
   `customer_id` estiver ausente. O trigger `bind_service_request_customer_identity`
   (`20260905001000`) fixa o vínculo canônico para `origin='customer'`; registros legados
   sem `customer_id` permanecem fora do CRM (não reatribuídos, não inferidos),,


6. **Fail-closed:** ausência de permissão, contrato, dado ou vínculo resulta em
   indisponível/não encontrado, nunca em zero apresentado como real nem em criação
   automática. Leituras de CRM sombreadas pelas políticas RLS existentes por papel
   (`customers`/`customer_channels`: cliente lê só a própria; `concierge`/`admin`
   leem operacionalmente; `provider` e `anon` sem acesso — migration `20260730153004`);
   `service_requests` escopadas por papel (`20260712210000`); `customer_vehicles`
   escopadas por papel (`20260716000000`.



## 6. PII, minimização, autorização e auditabilidade

Princípios:

- **Minimização:** persistir somente o mínimo necessário por etapa e nunca coletar
  dado que a etapa não usa. Exemplo já vigente: o intake inteligente não persiste
  telefone em `service_requests` para origem WhatsApp (`customer_phone=null`) e os
  `service_attachments` ficam em bucket privado com sanitização de metadados./
  - Em leads futuros, não capturar dado sensível (documento, placa quando não
    necessária, localização quando não essencial) até o momento e a finalidade
    justificarem.
- **Autorização:** leitura/exposição sempre escopada por papel (Modelo de autorização:
  `customer`, `concierge`, `provider`, `admin`; RLS ativa em todas as tabelas
  públicas, conforme `supabase/tests/rls_catalog.sql` — a lista é um contrato: adicionar
  tabela pública exige revisão explícita de RLS). O Command Center administrativo
  exige Admin; Concierge conserva seu portal atual sem acesso administrativo
  (mesma posição da fatia V1 #235/#236).

- **Auditabilidade:** toda ação relevante registra ator, papel, canal, origem, data e
  evidência: `service_request_events` (imutáveis, idempotentes); `identity_access_events`
  (onboarding/binding de identidade); `resolved_by`/`resolved_at` no binding de
  WhatsApp; `whatsapp_outbound_control_events` append-only para controle de
  mensageria. No futuro, a camada de leads deve emitir eventos equivalentes
  (nunca mutar o passado).
- **Fail-closed:** sem permissão ou contrato, bloco; sem consentimento explícito

  (`consent_status`), nenhuma comunicação futura; outbound WhatsApp tem kill

  switch próprio (`whatsapp_outbound_control.outbound_enabled=false` por padrão)e
  enfileiramento somente humano para origens `human` (`queue_whatsapp_outbound_message_gated`)../
  Nenhuma origem de lead obtém automaticamente o direito de enviar mensagens..


### Matriz de dados mínimos permitidos por etapa e classificação PII

| Etapa | Dado mínimo permitido | PII/classificação | Permissão de exposição operacional (hoje) | Obrigatório/condição |
| ---------------------------------- | ------------------------------------------------------------ | -------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| Lead (contato inicial, ex. WhatsApp não vinculado) | canal privado (`channel_address` E.164); `external_message_id`; tipo/de data da mensagem | **PII alta** (endereço de canal identifica pessoa-|) | `concierge`/`admin` (`whatsapp_unbound_contacts/messages`); sem payload de mensagem para `provider` | consentimento futuro antes de comunicação; imutável após persistência |
| Qualificado | atributos declarados mínimos (nome de exibição, interesse) com `origin`/provenance | PII: nome de exibição (média); combinação pode identificar | `concierge`/`admin`; mínimo possível | provenance e consentimento; sem telefone como chave |
| Conversão pendente | vínculo de canal à identidade canônica (`customer_channels`) | **PII alta** (endereço de canal) | `concierge`/`admin`; cliente lê só o próprio canal | binding humano auditável; conflito → bloqueio (`23505`) |
| Cliente vinculado | `customers.display_name`; canais com consentimento; relação de identidade | PII: nome, canais (alta) | cliente (só a própria); `concierge`/`admin`; `provider` sem acesso | identidade canônica obrigatória; nunca por nome/telefone |
| Veículo | `customer_vehicles`: marca/modelo/ano/placa/km; `customer_confirmed_at` | **PII alta** (placa identificadora; comentário na tabela proíbe log de placa) | escopado por papel (`20260716000000`); Admin e dona | confirmação explícita da cliente (`data_source='customer_confirmed'`) |
| Solicitação (`service_request`) | `service_stage`, `origin`, relato, urgência, categoria, veículo vinculado | PII: relato/endereço (alta;, placa (alta) | escopado por papel; provider só o necessário ao atendimento | `customer_id` canônico quando origin customer; evento de criação auditável |

Observação: documentos,, orçamentos, pagamentos/plano/assinatura e ranking/margem de
prestador **não possuem contrato canônico de leitura pronta para o funil nesta V0** e
permanecem indisponíveis/futuros (mesma posição da ficha V1), sem inventar domínio.


## 7. Métricas

### Deriváveis hoje (sem schema novo, sem overclaim)

Todas derivadas das tabelas canônicas já listadas, com as mesmas definições
documentadas na fatia V1 (#235/#236):

| Métrica | Fonte canônica | Definição |
| ------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Clientes cadastrados | `customers` | contagem exata de registros autorizados |
| Novos clientes no período | `customers.created_at` | mês corrente/timestamp da fonte, com fuso explícito (UTC no motor, exibição America/Sao_Paulo) |
| Clientes ativos | `service_requests.customer_id` | clientes distintos com `customer_id` em solicitações nas cinco etapas abertas; **não persistido**; concluído/cancelado excluídos |
| Veículos cadastrados | `customer_vehicles` | contagem exata, incluindo inativos |
| Solicitações abertas | `service_requests` | etapas abertas canônicas (idem V1), incluindo solicitações sem `customer_id` (que não contam como cliente ativa) |
| Última interação | `service_request_events` | evento operacional mais recente por solicitação vinculada; papel/canal/data; identificado como potencialmente automático; sem evento, não derivar de `updated_at` |
| Origem da solicitação | `service_requests.origin` | distribuição por `origin` (`customer`/`concierge`/`whatsapp`) já existente |

### Futuras (exigem camada de lead com estado canônico e eventos auditáveis)

| Métrica futura | Dependência | Observação |
| ------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------ |
| Leads recebidos | camada de intake (estado canônico de lead com `origin` e eventos) | não inventar contagem sem contrato de lead |
| Qualificados | atributos mínimos + consentimento rastreado na camada de lead | exige definição explícita de "qualificado" |
| Taxa de conversão lead → cliente | eventos de funil imutáveis (lead criado, qualificado, vinculado) | numerador/denominador definidos e documentados; sem dado, indisponível |
| Tempo até conversão | timestamps canônicos de criação e binding | somento com timestamps fiáveis de lead e vínculo |
| Origem/recorrência | `customer_channels`/`service_requests.origin` + futura camada | recorrência exige definição canônica (ex. nova solicitação/lacuna, não "cliente voltou" inferido{) |

Nenhuma métrica é apresentada como real se sua fonte não estiver disponível:
leituras paginadas, estados `available/unavailable`, e nenhum KPI parcial (idem
fatia V1 `docs/customer-crm-v1.md` na PR #236).

## 8. Especificação de UI futura no Command Center (sem implementação))

Seam de UI a contemplar nas subissues futuras, **sem conflitar com a PR #236**
(navegação `Clientes` V1 e `Dashboard` V1 já especificadas lá). Para a área de
**Leads**, propor novas rotas sob `app/(command)/`, sem tocar nos arquivos da PR
#236 nem nas rotas existentes:

| Superfície futura | Rota sugerida(seam, não implementada) | Conteúdo planejado |
| ------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Lista de leads | `/leads` (novo módulo em `modules/registry.ts` quando implementado) | tabela pesquisável/filtrável: status do lead, origem, canal (mascarado para operação quando PII), data de entrada; loading/empty/error states; paginação literal como na V1 |
| Funil | painel/funil na mesma área (aba `Funil` ou `/leads?view=funnel`) | contagens por estágio derivadas somente de fontes canônicas/autorizadas; estados `available/unavailable`; sem inventar conversão sem evento de binding |
| Detalhe do lead | `/leads/[id]` | origem/provenance, canal com consentimento, eventos auditáveis da camada de lead, ações humanas seguras (ex. vincular canal à identidade existente via `bind_whatsapp_unbound_contact` quando WhatsApp; registrar bloqueio de conflito); sem mutation nova nesta issue |

Regras de UI:

- reutilizar os componentes/estados de erro, empty e loading e o padrão de leitura
  paginada fail-closed da V1 (dashboard metrics e painéis do CRM Clientes na
  PR #236); nenhum fetch, kpi parcial nem busca interpolada indiscriminada./
  - `requireRole(["admin"])` para entrada administrativa da área de leads (conforme
  superfícies administrativas existentes); Concierge conserva o fluxo de binding já
  existente no contrato WhatsApp.
 - Não expor ao `provider` nenhum lead, identidade, canal, ranking ou margem./
  - Ações no detalhe do lead somente quando a primitive canônica existir e estiver
  coberta por testes (hoje: binding WhatsApp); demais origens ficam como botão/
  ação desabilitada com explicação até a subissue correspondente.



## 9. Plano incremental em subissues seguras (ordem de dependência))

| Ordem | Subissue sugerida | Entrega | Exige schema novo? | Exige integração externa? | Exige mensageria real? | Human Gate |
| --- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | --------------------------- | --------------------------------- | --------------------------------- | ---------------------------------------------- |
| 0 | (esta issue) | arquitetura e funil documentados; contratos validados | não | não | não | não |
| 1 | Camada de intake de leads V1 (regras fail-closed) | estado canônico de lead: `origin`, `status`, `consent`, eventos auditáveis, RLS e catálogo atualizados | **sim** (nova tabela pública + eventos; exige revisão `rls_catalog.sql`) | não | não | sim (binding humano a identidade) |
| 2 | Ingestion de lead por formulário/landing (conteúdo, parceiros V1) | endpoint servidor validado, idempotente, sem PII além do mínimo, sem email/telefone como chave | não (se reusar a camada da subissue 1) | sim (formulário/landing próprio; ainda sem Meta/Instagram) | não | sim (revisão humana antes de uso comercial) |
| 3 | Fila de conversão lead → cliente | superfície operacional de revisão e binding (reusa primitives existentes; novos bindings por origem com conflitos human-in-the-loop) | talvez (colunas de provenance/binding por origem) | não | não | sim (todo binding é humano e auditável) |
| 4 | Métricas de funil | dashboards de lead/conversão (conforme Seção 7) | não (usa eventos da subissue 1) | não | não | sim (definições aprovadas por humano; sem overclaim) |
| 5 | Área de Leads no Command Center | lista/funil/detalhe (Seção 8) | não | não | não | sim (UI administrativa Admin-only) |
| 6 | Instagram/parceiros como canais externos | integração de canal validada com provenance e consentimento; nunca scraping | **sim** (endereçamento/provenance por canal) | **sim** (Meta/API de parceiro) | apenas após gates de consentimento e kill switch | **sim** (gates de canal, custo, jurídico e de consentimento) |
| 7 | Mensageria/CRM de recorrência | campanhas transacionais com templates aprovados e consentimento | talvez | sim | **sim** (somente com consentimento e kill switch) | **sim** (`queue_whatsapp_outbound_message_gated` exige humano/Admin; kill switch por padrão) |

Regras de sequência:

- Cada subissue nasce da `main` atual, em branch isolada, e entrega uma única
  fatia verificável (ADR: uma entrega por sessão, reutilizar contratos existentes,não
  criar arquitetura paralela).
- Qualquer passo que toque schema novo passa antes por: documento de arquitetura
  (estrutura semelhante a esta), atualização de `supabase/tests/rls_catalog.sql` e da
  matriz de autorização, e testes de isolamento/autorização em banco isolado.

- Nenhum passo pode enviar mensagem real, pagamento ou side effect externo sem
  os gates humanos e de produção já existentes (`verah-os/production-policy`,
  `whatsapp_outbound_control`, política de release da VERAH OS). Origem de lead não
  concede direito de mensageria automática..
- Merge somente via fluxo revisado (`codex:auto-merge`, CI verde,e demais gates
  da política de release). Nada desta issue é merged automaticamente..


## 10. Validação e checks aplicáveis

Esta entrega é documentação/arquitetura. Não há código de aplicação ou migration
novo para testar. Os checks repository-safe aplicáveis são:

- **Links e referências de contratos:** cada migration citada nas Seções 4 e 6 foi
  conferida contra os arquivos versionados neste repositório (`supabase/migrations/`,
  `types/service-request.ts`, `services/service-requests/...`); nenhuma entidade
  inventada.
- **Consistência com issue #235/#236:** as definições de cliente ativo, novos clientes,
  último interação e falhas/limites reproduzem exatamente a fatia V1 (doc
  `docs/customer-crm-v1.md` na PR #236); nenhuma convergência, frontend ou schema
  desta issue conflita com aquela PR (rotas futuras são `seams`, não arquivos).
- **Catálogo/RLS:** a camada futura de leads **(Seção 8, subissues 1)** deverá
  atualizar `supabase/tests/rls_catalog.sql` e a matriz de autorização; nesta issue não
  há tabela nova a catalogar.
- Quando uma subissue com código for implementada, rodar o fluxo canônico:

```bash
pnpm ci:application
pnpm ci:database
```

  (documentado em `docs/ci.md`; CI roda em banco local descartável, sem acesso
  remoto, seeds ou segredos; `rls_catalog.sql` exige RLS em qualquer tabela
  pública nova).

## 11. Invariantes finais (resumo executivo)

- backend canônico permanece a única fonte da verdade; nenhum CRM paralelo;
- identidade/customer binding canônicos preservados (`customers`, `customer_channels`,
  `identity_relations`),
- `service_request` canônico preservado (§4);
- RLS, autorização e auditabilidade preservados (§6; `rls_catalog.sql` como contrato);

- nenhuma criação automática de cliente por telefone/nome (§5);
- nenhuma exposição indevida de prestador (não há ranking/margem/payload neste
  funil (§6);
- nenhum dado fictício apresentado como real (§3, §7);
- fail-closed para permissões, contratos, dados e mensageria (§5, §6.


## Referências

- Issue #238 (esta), #231 (CRM operacional), #235/#236 (CRM Clientes V1), #164
  (EPIC SHIP VERAH); ADR 001 (identidade de cliente independente do canal);
  ADR 009(control plane, fora deste escopo mas reafirma gates de release/merge);
  WhatsApp Channel Architecture (`docs/architecture/whatsapp-channel-architecture.md`);
  Modelo de autorização (`docs/authorization-model.md`); CI e testes por papel

  (`docs/ci.md`); Product Principles (`docs/product/verah-product-principles.md`);
  Identity onboarding (`docs/identity-onboarding.md`); políticas VERAH OS
  (`docs/verah-os/production-policy.md`, `release-policy.md`, `autonomy-policy.md`).