# Auditoria de convergência — VERAH existente × mobile (Issue #176)

Data: 2026-09-02. Base: `main` em `d037e93` (após merge de #172 auth mobile e
#174 onboarding + garagem mobile).

Guardrail: #175. Refs: #164, #147, #139, #172, #174. Atualiza, sem substituir,
a auditoria da Release 1.0 (`docs/ship-verah/audit-release-1.0.md`, pré-mobile).

## Método (busca verificável)

Cada afirmação cita caminho concreto do repositório. Verificações executadas
nesta sessão sobre a base acima:

- listagem de `supabase/migrations` (42 migrations) e `supabase/tests` (suíte
  SQL de segurança);
- grep por `odomet|quilometrag|abastec|combust|fuel`, `lembrete|reminder|
  next_service|manutenc` e `document|anexo|attachment|histori` em `services/`,
  `modules/`, `app/`, `lib/`, `mobile/`, `supabase/`, `tests/`;
- inspeção de exports: `services/service-requests/actions.ts`,
  `services/concierge/*`, `services/customer-vehicles/actions.ts`,
  `lib/customer-vehicle.ts`, `lib/customer-service-stage.ts`,
  `mobile/src/customer-journey.ts`, `lib/customer-pilot-demo.ts`;
- políticas RLS confirmadas em `20260712000000_create_service_requests.sql`,
  `20260716000000_create_customer_vehicles.sql` e
  `20260827040000_vehicle_onboarding.sql`.

Nenhuma capacidade foi inferida de documentação aspiracional. Nada nesta issue
implementa produto.

## Veredito

O backend VERAH (Supabase + serviços + RLS) já sustenta identidade, onboarding,
garagem, atendimento, concierge operacional, prestadores, WhatsApp e inteligência
veicular como fundação. O mobile atual (`mobile/`) cobre **somente** auth
(#172) e onboarding + garagem (#173/#174), reutilizando corretamente os
contratos canônicos #139 — sem backend paralelo e sem duplicação detectada.
Tudo além dessas duas fatias deve **reutilizar/expor/adaptar** o que existe;
`NOVO` é admitido apenas onde a busca confirmou ausência (combustível, despesas,
documentos do veículo pela cliente, motor de lembretes, dashboard de valor).

## Mapa de convergência por capacidade

Legenda: REUTILIZAR · EXPOR NO MOBILE · ADAPTAR UX · NOVO SOMENTE SE NÃO EXISTIR.

| # | Capacidade | Estado VERAH | Estado mobile | Classificação | Evidência (caminhos/contratos) | Ação recomendada |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Visão cliente/demo | Existe web: home da cliente com dados reais (role `customer`) + fixture piloto sintética | Ausente | EXPOR NO MOBILE (dados reais) + REUTILIZAR (serviços) | `app/demo/cliente/page.tsx` (usa `requireRole(["customer"])`, `listCustomerVehicles`, `listCustomerServiceRequests`, `listCustomerQuoteSummaries`); `app/demo/cliente/{veiculos,veiculo/[id],historico,garantias,novo-atendimento,atendimento/[id],piloto}`; fixture: `lib/customer-pilot-demo.ts` (`synthetic: true`), `tests/customer-pilot-demo.test.mjs` | Criar home mobile lendo as mesmas tabelas via anon key + RLS; nunca duplicar agregações em estado local. Demo segue fixture sintética — sem representar produção |
| 2 | Auth/identidade | Existe e é canônica | **Já implementado (#172)** | REUTILIZAR | Supabase Auth e-mail/senha; `services/auth/actions.ts`; `app/entrar`, `app/login`, `middleware.ts`; `user_profiles` + `verah_identities` (`20260712210000`, `20260730150101`, `20260730153004`); `supabase/tests/customer_identity_security.sql`. Mobile: `mobile/src/supabase.ts` (`getAuthFacade()`, AsyncStorage, fail-closed), `mobile/src/auth-session.ts`, `mobile/src/{AuthGate,AuthScreen}.tsx`, `mobile/tests/auth-session.test.mjs` | Proibido criar identidade/tabela de usuários paralela no mobile. Provider de auth é método de login, não identidade — invariante já testado |
| 3 | Onboarding | Existe (web + RPC canônico) | **Já implementado (#174)** | REUTILIZAR | RPCs `start_customer_onboarding`, `complete_customer_basic_onboarding`, `refresh_customer_onboarding` (`20260827013000`); `app/onboarding/cliente`; `supabase/tests/identity_onboarding_security.sql`. Mobile: `mobile/src/customer-journey.ts` (`ONBOARDING_TERMS_VERSION = "pilot-alpha-onboarding-v1"`, roteamento por RPC idempotente), `mobile/src/CustomerJourney.tsx` | Manter UI web e mobile como superfícies distintas sobre o mesmo contrato (ADAPTAR UX já aplicada). Não reimplementar a state machine no cliente |
| 4 | Garagem/veículos | Existe com proveniência canônica (#139) | **Já implementado (#174)** | REUTILIZAR | `customer_vehicles` com RLS owner-based (`20260716000000`: policies read/create/update; `revoke all ... from anon, authenticated` seguido de grants); criação RPC-only: `revoke insert on customer_vehicles from authenticated` + RPC `confirm_customer_vehicle` (`20260827040000`); `services/customer-vehicles/actions.ts`; `supabase/tests/vehicle_onboarding_security.sql`. Mobile: `mobile/src/customer-journey.ts` (`prepareVehicleDraft`, `normalizeBrazilianPlate`, `GarageVehicle`, `lookup_source = 'manual'`, `p_customer_confirmed = true`) | Nunca reintroduzir insert direto. Leitura da garagem via RLS owner-based como já feito no mobile |
| 5 | Solicitações/atendimento ("Preciso de ajuda") | Existe completo no backend | Ausente | EXPOR NO MOBILE | `service_requests` (`20260712000000`: policies "Customers can read their service requests" + "Customers can create their service requests"; `20260713000000` state; `20260712200000` jornada completa); `services/service-requests/actions.ts` (`createServiceRequest`, `submitServiceRequestAnswers`); triagem determinística `services/service-copilot`; intake `services/intelligent-intake`; projeção de tracking `lib/customer-service-stage.ts` (`customerStageLabels`, `customerJourneyStages`) | Criar request no mobile via PostgREST insert sob RLS (policy de criação por cliente já existe) — sem endpoint novo. Portar labels da projeção; não criar segunda máquina de estado |
| 6 | Concierge (operação + leva-e-traz) | Existe como operação interna + fundação de custódia | Ausente (correto) | REUTILIZAR (operação); EXPOR NO MOBILE só o tracking da cliente | `services/concierge/actions.ts` (`acceptServiceRequest`); `services/concierge/lifecycle-actions.ts` (`setServiceRequestPriority`, `cancelServiceRequest`, `reopenServiceRequest`); `app/(command)/concierge`; `lib/concierge-operations.ts`; migrations `20260712033000` (acceptance), `20260715000000` (lifecycle), `20260826143726` (custódia) + `supabase/tests/pilot_alpha_custody_security.sql` | Mobile não recria console concierge. Custódia/leva-e-traz exige evidência, autorização e incidentes — nunca simplificar esses controles |
| 7 | Prestador | Existe (homologação, convites, ações seguras) | Ausente (fora do app cliente 1.0) | REUTILIZAR | `services/service-providers/{actions.ts,service-providers-service.ts}`; `services/provider-invitations`; `app/onboarding/prestador`; `app/demo/prestador`; migrations `20260712043000`, `20260712220000`, `20260819192003`, `20260826150710` + `supabase/tests/provider_homologation_security.sql`, `provider_invitations_security.sql` | Fora do escopo do app cliente. Se um dia houver app prestador, reutilizar estes contratos — nunca duplicar homologação/convites |
| 8 | Histórico/documentos | Parcial: histórico de atendimentos existe; documentos do veículo pela cliente não existem | Ausente | EXPOR NO MOBILE (histórico); NOVO SOMENTE SE NÃO EXISTIR (documentos do veículo) | Histórico: `app/demo/cliente/historico/page.tsx`, eventos/estágio em `service_requests` + projeção `lib/customer-service-stage.ts`; anexos por atendimento: `service_attachments` (`20260731022348`); garantias: `app/demo/cliente/garantias/page.tsx`. Ausência de documentos/notas por veículo confirmada por grep (somente anexos de atendimento) | Mobile expõe histórico via leitura existente. Documentos do veículo: criar só quando entrar em escopo, com proveniência — distinguir de `service_attachments` (por atendimento) para não duplicar domínio |
| 9 | WhatsApp | Existe pipeline completo (inbound/outbound/mídia/readiness) | Ausente (correto) | REUTILIZAR | `services/whatsapp/{webhook-handler,worker,media,meta-adapter,message-catalog,readiness,synthetic-demo}.ts`; `app/demo/whatsapp`; `services/n8n/{worker,client,contract}.ts`; migrations `20260820025044`, `20260826193000`, `20260820032446`; `tests/whatsapp-intake.test.mjs` + `supabase/tests/whatsapp_production_readiness_security.sql` | WhatsApp permanece canal operacional via serviços existentes. Mobile não envia WhatsApp diretamente; notificações push ao app seriam NOVO futuro (fora do 1.0, gate HUMAN de credenciais) |
| 10 | Pagamentos | Existe apenas sandbox explícito (#130) | Ausente (fora do 1.0) | REUTILIZAR quando entrar em escopo | `services/payments-sandbox/{service,local-provider,demo,types}.ts`; `tests/payments-sandbox.test.mjs` | Nunca apresentar sandbox como pagamento real no mobile. Sem pagamentos no 1.0; qualquer fatia futura parte do sandbox existente |
| 11 | Inteligência veicular | Fundação existe (sintética/local + contratos) | Ausente (fora do 1.0) | REUTILIZAR; quando entrar: EXPOR NO MOBILE | `services/vehicle-intelligence/{service,local-provider,types}.ts`; `services/knowledge-platform/{repository,local-fixture,types}.ts`; `services/quote-intelligence`; `services/second-opinion`; migrations `20260802035514`, `20260803010500`, `20260805090000`; `docs/intelligence` | Quando entradas em escopo, mobile consome o serviço existente. Proveniência e escalonamento de conflito de evidências são invariantes — não resolver conflito silenciosamente no cliente |
| 12 | Manutenção/lembretes | Parcial: campos canônicos + mensagens de próximos cuidados; motor de lembretes não existe | Ausente | ADAPTAR UX (exibição); NOVO SOMENTE SE NÃO EXISTIR (motor de lembretes) | Campos `last_service_at`, `next_service_date`, `next_service_mileage` em `customer_vehicles` (`20260716000000`); `lib/customer-vehicle.ts` (`nextCareMessages`); histórico de serviços via `service_requests`. Ausência de motor de lembretes para cliente confirmada por grep (n8n é SLA operacional, não lembrete de cliente) | Mobile exibe próximos cuidados lendo os campos existentes (ADAPTAR UX, sem duplicar domínio). Motor de lembretes só quando priorizado; reutilizar esses campos como fonte |
| 13 | Odômetro/combustível/custos | Parcial: km atual + snapshot; combustível/despesas/custo-por-km não existem | Ausente | EXPOR NO MOBILE (km atual); NOVO SOMENTE SE NÃO EXISTIR (combustível/despesas) | `customer_vehicles.current_mileage` (policy "Customers update own vehicles" — `20260716000000`); snapshot por atendimento `service_requests.mileage_snapshot` (ver audit-release-1.0). Ausência de abastecimento/despesas/custo-por-km confirmada por grep em `services/`, `modules/`, `supabase/migrations`, `mobile/`. Fixture demo tem km sintético (`lib/customer-pilot-demo.ts` `mileageAtIntake`) — não é produção | Atualizar km no mobile via update RLS existente. Tabelas de abastecimento/despesas: NOVO quando priorizado, com proveniência e sem sobrepor `payments-sandbox` (que é ledger de pagamento, não despesa de veículo) |
| 14 | Dashboard/valor percebido | Dashboard operacional existe (Command Center); dashboard de valor da cliente não existe | Ausente | REUTILIZAR (ops, interno); NOVO SOMENTE SE NÃO EXISTIR (valor da cliente) | Ops: `app/(command)/dashboard/page.tsx` + `modules/dashboard` (stats de GitHub, ai-team, dispatcher, work-orders, concierge, providers, quotes). Cliente: home `app/demo/cliente/page.tsx` agrega veículos/requests/quotes como referência de leitura. Nenhuma agregação "quanto meu carro me custa" (grep: ausente) | Não expor nem duplicar o dashboard operacional no mobile. Dashboard de valor da cliente depende do item 13 e deve nascer sobre as leituras RLS existentes |

## Riscos de duplicação (flags explícitos)

1. **Identidade:** qualquer tabela/estado de usuário paralelo no mobile viola a
   identidade canônica (`verah_identities`/`user_profiles`). Auth provider é
   método de login, não identidade.
2. **Veículo RPC-only:** reintroduzir insert direto em `customer_vehicles` (no
   mobile ou em backend novo) quebra o contrato #139 e a proveniência.
3. **Segunda máquina de estado de atendimento:** mobile deve consumir a
   projeção `lib/customer-service-stage.ts` (labels/ordenação) — tracking da
   cliente é projeção do estado canônico, nunca um state machine paralelo.
4. **Server Actions web** (`services/*/actions.ts`) não rodam no RN: o canal
   mobile é PostgREST/RLS + RPCs com anon key. Criar endpoints REST novos para
   o mobile seria backend paralelo — proibido pelo guardrail.
5. **Console operacional** (concierge, dispatcher, dashboard ops, prestador)
   pertence ao Command Center; mobile não o replica.
6. **Fixture sintética ≠ produção:** `lib/customer-pilot-demo.ts`,
   `services/vehicle-intelligence/local-provider.ts`,
   `services/payments-sandbox/*` e `app/demo/whatsapp` são demo/sandbox. Nunca
   representar como realidade de produção no app.
7. **Anexos por atendimento** (`service_attachments`) ≠ documentos do veículo:
   quando documentos entrarem em escopo, modelar sem sobrepor o domínio de
   anexos existente.
8. **Pagamentos:** `payments-sandbox` é sandbox; nenhuma superfície mobile pode
   apresentá-lo como pagamento real.

## Gate para próximas issues (#175)

Toda issue nova sob #164 deve incluir seção `Convergência` citando o caminho
deste mapa, a classificação da capacidade e os contratos reutilizados. Sem essa
seção, a issue não está pronta para execução. As classificações `NOVO SOMENTE
SE NÃO EXISTIR` acima (documentos do veículo, combustível/despesas, motor de
lembretes, dashboard de valor) documentam a busca verificável exigida; qualquer
nova capacidade fora desta lista exige nova busca antes da codificação.

## Restrições respeitadas nesta auditoria

Nenhuma feature implementada; nenhum backend paralelo; nenhum contrato duplicado;
nenhuma produção, secret, pagamento/mensagem real, migração remota, operação
destrutiva, dispatcher, CORRIDAH ou commit direto na main. Recomendações de
UX/UI limitam-se a ADAPTAR UX sem duplicar domínio.
