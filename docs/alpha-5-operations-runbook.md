# Alpha 5 — Runbook operacional e checklist de prontidão do piloto

Issue #237. Data: 2026-09-10 (base atualizada em 2026-09-11). Base: `main` em `d3917825d12356ed4bfff8ee1c7caa4e1b0196f1` (inclui #233/#234 — fix #230 e institucional home #232). Refs: #237, #164, #231, #230, #233, #234, #236.

## 0. Escopo e invariantes

Este artefato é **documentação e readiness somente**. Ele não executa nenhuma ação
externa: nenhum banco remoto, nenhum push/repair/reconciliation de migration,
nenhum secret, nenhuma produção/deploy/promotion, nenhum pagamento ou mensagem
real, nenhum App ID/signing/submissão/publicação, nenhum merge, e nenhum código
das PRs Draft #233/#234/#236 é incorporado. Human Gates estão listados na seção 8
e **não são executados aqui**. Todas as capacidades citadas abaixo existem na `main`
como contrato, tela, teste ou runbook — nada é inventado nem inferido de documentação
aspiracional (regra da auditoria #164). Na classificação do mapa de convergência (#176),
esta issue é documentação/readiness: reutiliza as classificações já existentes e não
cria capacidade nova.

Invariantes preservados: backend, identidade e `service_request` canônicos; RLS/
autorização preservadas; nenhuma base/identidade paralela; nenhuma exposição indevida
de prestador à cliente; fail-closed; fluxo financeiro/mensageria real inalterado..

##  1. Objetivo

Preparar o **runbook operacional do Alpha inicial de até 5 clientes em Franca/SP**
e um **checklist verificável de prontidão**, reutilizando apenas contratos/capacidades
já existentes no repositório. O Alpha percorre a jornada canônica
`cliente → veículo → service_request → concierge → rede/prestador → orçamento/aprovação
→ leva & traz → serviço → devolução → histórico/pós-venda`, com as primitivas de
custódia/consentimento/incidentes do `pilot_alpha_custody_foundation` como controles
obrigatórios de evidência, autorização e incidentes.

##  2. Jornada operacional ponta a ponta

Legenda: **O** = operador humano (Concierge/Admin); **C** = cliente; **P** = prestador.


| Etapa | Ação | Contrato/tela/teste — evidência no repositório | Ator |
| --- | --- | --- | --- |
| 1. Cliente — identidade | Login/cadastro por e-mail (+ Google OAuth no mobile). Identidade canônica em `user_profiles`, `verah_identities` e `customers`; auth provider é método de login, não identidade. | `services/auth/actions.ts`; `app/entrar`, `app/entrar/cliente`, `app/entrar/concierge`, `app/entrar/prestador`; `app/login`; `middleware.ts`; migrations `20260712210000`, `20260730150101`, `20260730153004`; testes `supabase/tests/customer_identity_security.sql`, `tests/auth-access.test.mjs`, `tests/identity-onboarding.test.mjs`; mobile `mobile/src/auth-session.ts`, `mobile/src/AuthScreen.tsx`, `mobile/src/AuthGate.tsx` (#172) | C |
| 2. Onboarding da cliente | Estado `identity_onboarding` + RPCs `start_customer_onboarding`, `complete_customer_basic_onboarding`, `refresh_customer_onboarding`; termos `ONBOARDING_TERMS_VERSION = "pilot-alpha-onboarding-v1"`. | `app/onboarding/cliente`; migration `20260827013000`; `mobile/src/customer-journey.ts`; `supabase/tests/identity_onboarding_security.sql`; `mobile/tests/customer-journey.test.mjs` (#174) | C |
| 3. Veículo — garagem | Cadastro/confirmação **RPC-only** via `confirm_customer_vehicle` com proveniência obrigatória (`data_source`, `lookup_provider`, `source_synthetic`, `customer_confirmed_at`); insert direto revogado de `authenticated`; leitura/update owner-based via RLS. | `services/customer-vehicles` (`actions.ts`, `onboarding.ts`, `customer-vehicles-service.ts`); `app/demo/cliente/veiculos`; `app/demo/cliente/veiculo/[id]`; `mobile/src/CustomerJourney.tsx` (#173/#174) | C |
| 4. `service_request` — "Preciso de ajuda" | Criação `createServiceRequest` (origem `customer`) ou `createConciergeServiceRequest` (origem `concierge`); triagem determinística `analyzeServiceRequest` — não é diagnóstico, organiza o próximo passo; snapshot de km; respostas às perguntas do copiloto via `submit_service_request_answers`; tracking é projeção do `service_stage` canônico — sem segunda máquina de estado. | `services/service-requests/actions.ts`; `services/service-copilot`; `lib/customer-service-stage.ts`; `app/demo/cliente/novo-atendimento`; `app/demo/cliente/atendimento/[id]`; mobile `mobile/src/service-request.ts` e `mobile/src/CustomerRequests.tsx` (#194) | C |
| 5. Concierge — aceite e operação | `accept_service_request` cria vínculo `concierge_id`; prioridade via `set_service_request_priority`; cancelamento/reabertura via `cancel_service_request`/`reopen_service_request`, com razão obrigatória e confirmação; SLA operacional (`SLA_ATTENTION_AFTER_MS = 2 h`, `SLA_OVERDUE_AFTER_MS =  8h`). | `services/concierge/actions.ts`; `services/concierge/lifecycle-actions.ts`; `app/(command)/concierge`; `lib/concierge-operations.ts`; migrations `20260712033000`, `20260715000000`; `supabase/tests/pilot_alpha_custody_security.sql` | O |
| 6. Rede/prestador — indicação | `assign_provider_to_service_request` ou `reassign_provider_to_service_request` com razão; portal do prestador lista somente os atendimentos do próprio `provider_id`; homologação e convites existem. | `services/service-providers/actions.ts`; `services/service-providers/service-providers-service.ts`; `services/provider-invitations`; `app/(command)/concierge/[id]`; `app/demo/prestador` e `app/demo/prestador/atendimento/[id]`; migrations `20260712043000`, `20260712220000`, `20260819192003`, `20260826150710`; `supabase/tests/provider_homologation_security.sql`, `provider_invitations_security.sql` | O |
| 7. Orçamento — rascunho e submissão | Prestador salva rascunho `save_service_quote_draft` e envia `submit_service_quote`; itens, totais, prazo, garantia e notas técnicas. | `services/service-quotes/actions.ts` (`saveQuote`); `types/service-quote.ts`; `app/demo/prestador/atendimento/[id]`; `tests/quote-intelligence.test.mjs` | P |
| 8. Orçamento — qualidade e segunda opinião | Comparação de propostas e segunda opinião de movimentação, sempre reutilizando o assessment imutável elegível. | `services/quote-quality`; `services/second-opinion`; `docs/second-opinion-vehicle-movement.md`; migrations `20260803010500`, `20260805090000`; `tests/quote-quality.test.mjs`, `tests/second-opinion.test.mjs` | O |
| 9. Aprovação — cliente | `approve_service_quote` ou `request_quote_clarification` com nota; consentimento separado de preço via `record_pilot_consent_receipt` (`separate_service_price_approval`) quando o contrato de custódia estiver ativo. | `services/service-quotes/actions.ts` (`decideQuote`); `app/demo/cliente/atendimento/[id]`; RPC `record_pilot_consent_receipt` na migration `20260826143726` | C |
| 10. Leva & traz — consentimento e custódia | Os 5 consentimentos pilot obrigatórios — `pilot_alpha_participation`, `vehicle_collection_return`, `custody_checkin_acknowledgement`, `route_destination_boundary`, `separate_service_price_approval` — via `record_pilot_consent_receipt`; append-only, supersession explícita, hash `presented_text_hash` do texto apresentado; eventos de custódia `record_vehicle_custody_event` (`pickup`, `transfer`, `provider_dropoff`, `provider_pickup`, `return`, `incident_hold`) com odômetro, nível de combustível, chaves/itens, danos visíveis e **evidências obrigatórias em `pickup`/`return`** (`evidence_attachment_ids`; `service_attachments` privados). | `20260826143726` (tabelas `pilot_consent_receipts` e `vehicle_custody_events`; RPCs `record_pilot_consent_receipt` e `record_vehicle_custody_event`; `supabase/tests/pilot_alpha_custody_security.sql`; anexos em `20260731022348`; a demo sintética `lib/customer-pilot-demo.ts` mostra o leva-e-traz somente como fixture). | O + C |
| 11. Serviço — execução | Prestador marca conclusão `provider_mark_service_completed`; Concierge confirma `concierge_confirm_service_completion`; registro de tempo manual opcional via `record_pilot_concierge_time` com fases `intake`, `triage`, `provider_coordination`, `pickup`, `quote_review`, `execution`, `return`, `incident`, `follow_up`. | `services/service-completion/actions.ts`; `app/demo/prestador/atendimento/[id]`; `app/(command)/concierge/[id]`; RPCs na migration `20260826143726` | O + P |
| 12. Devolução | Evento `return` de custódia com odômetro, combustível, chaves e danos; conferência VERAH; conclusão registrada em `provider_completed_at`, `concierge_confirmed_at` e `completed_at`. | RPC `record_vehicle_custody_event`; RPC `concierge_confirm_service_completion`; `types/service-request.ts` | O |
| 13. Histórico/pós-venda | Satisfação via `submit_service_rating` (`customer_rating`, `customer_feedback`, `customer_rated_at`); histórico e garantias na demo; próximo cuidado derivado de `next_service_date`, `next_service_mileage` e `last_service_at`; manutenção canônica via `register_vehicle_maintenance` (#216); documentos do veículo via `register_vehicle_document` (#217). | `services/service-completion/actions.ts` (`submitRating`); `app/demo/cliente/historico`; `app/demo/cliente/garantias`; `app/demo/cliente/veiculo/[id]`; `lib/customer-vehicle.ts` (`nextCareMessages`); `mobile/src/CustomerRequests.tsx`, `mobile/src/MaintenanceScreen.tsx`, `mobile/src/VehicleDocumentsScreen.tsx`, `mobile/src/MileageHistoryScreen.tsx`; migrations `20260909005541`, `20260909120000`; `docs/vehicle-maintenance.md` | C + O |

##  3. Matriz de prontidão — Alpha 5

Legenda: **PRONTO** = implementado e verificável no repositório além de nenhuma
ação externa;; **BLOQUEADO** = parcial ou dependente de ambiente/produção;; **HUMAN
GATE** = exige ação humana externa explícita (seção 8); **FUTURO** = não existe
hoje e exige nova capacidade. Nenhuma capacidade é marcada além do que as evidências
suportam..


| Capacidade | Estado | Evidência | Verificação | Ação mínima se bloqueado |
| --- | --- | --- | --- | --- |
| Identidade/login/cadastro | PRONTO | `services/auth`; migrations `20260712210000`, `20260730150101`, `20260730153004`; `supabase/tests/customer_identity_security.sql` | `pnpm test`; `pnpm ci:database` | — |
| Onboarding piloto v1 | PRONTO | RPCs `20260827013000`; `mobile/src/customer-journey.ts`; `supabase/tests/identity_onboarding_security.sql` | `pnpm ci:database`; `cd mobile && pnpm test && pnpm typecheck` | — |
| Garagem/veículos RPC-only | PRONTO | `20260716000000` + `20260827040000`; `supabase/tests/vehicle_onboarding_security.sql` | `pnpm ci:database`; `tests/vehicle-onboarding.test.mjs` | — |
| `service_request` + triagem + tracking | PRONTO | `services/service-requests`; `services/service-copilot`; `lib/customer-service-stage.ts`; policies `20260712000000`/`20260713000000` | `pnpm test`; `pnpm ci:database` | — |
| Concierge — aceite/prioridade/cancelar/reabrir | PRONTO | `services/concierge`; migrations `20260712033000`, `20260715000000` | `pnpm ci:database` | — |
| Work orders | PRONTO — interno | `services/work-orders`; `app/(command)/work-orders` | `pnpm test` | — |
| Rede/prestador — homologação, convites, portal | PRONTO | migrations `20260712043000`, `20260712220000`, `20260819192003`, `20260826150710`; `services/provider-invitations`; `supabase/tests/provider_homologation_security.sql`, `provider_invitations_security.sql` | `pnpm ci:database` | — |
| Indicação `assign`/`reassign` | PRONTO | `services/service-providers/actions.ts`; RPCs `assign_provider_to_service_request`/`reassign_provider_to_service_request` | `pnpm ci:database` | — |
| Orçamento — rascunho/submissão/aprovação/clarificação | PRONTO | `services/service-quotes/actions.ts`; migrations `20260712200000`, `20260802035514`; `tests/quote-intelligence.test.mjs` | `pnpm test`; `pnpm ci:database` | — |
| Qualidade de proposta e segunda opinião | PRONTO | `services/quote-quality`; `services/second-opinion`; migrations `20260803010500`, `20260805090000` | `pnpm test` | — |
| Consentimento pilot — 5 tipos append-only | PRONTO | `pilot_consent_receipts` + `record_pilot_consent_receipt` em `20260826143726` | `pnpm ci:database` | — |
| Custódia/leva-e-traz com evidência obrigatória | PRONTO | `vehicle_custody_events` + `record_vehicle_custody_event` em `20260826143726`; `service_attachments` em `20260731022348` | `pnpm ci:database` | — |
| Incidentes e rework | PRONTO | `service_incidents` + `open_service_incident` + `record_service_incident_action` em `20260826143726` | `pnpm ci:database` | — |
| Conclusão — prestador + conferência concierge | PRONTO | `services/service-completion/actions.ts`; RPCs `provider_mark_service_completed`, `concierge_confirm_service_completion` | `pnpm test`; `pnpm ci:database` | — |
| Satisfação | PRONTO | `submit_service_rating` (`customer_rating`/`customer_feedback`/`customer_rated_at`) | `pnpm ci:database` | — |
| Métricas do piloto | PRONTO | `get_pilot_alpha_metrics` em `20260826143726`, testada em `pilot_alpha_custody_security.sql` | `pnpm ci:database` | — |
| Quilometragem atual + snapshot | PRONTO | `customer_vehicles.current_mileage` + `service_requests.mileage_snapshot`; logs `20260907000000` (#213) | `pnpm ci:database` | Se drift remoto: usar o fallback da seção 5 |
| Combustível/recarga/despesas | PRONTO na `main`; **uso em piloto real = gate** | `20260907120000` (#214); `20260910000000` (#230); `20260908000000` (#215); `mobile/src/FuelHistoryScreen.tsx` e `mobile/src/MileageHistoryScreen.tsx`; testes `mobile/tests/fuel-log.test.mjs`, `mobile/tests/charging-log.test.mjs`, `mobile/tests/energy-history.test.mjs` | `cd mobile && pnpm test && pnpm typecheck` | Aplicar migrations no ambiente alvo somente após o gate humano de banco (#83); se indisponível, usar fallback da seção 5 |
| Manutenção e lembretes | PRONTO — regra pura | `20260909005541`; `mobile/src/maintenance.ts`, `mobile/src/maintenance-assist.ts`, `mobile/src/MaintenanceScreen.tsx`; `docs/vehicle-maintenance.md` | `node --experimental-strip-types --test mobile/tests/maintenance.test.mjs`; `cd mobile && pnpm check` | Idem — fallback da seção 5 |
| Documentos do veículo | PRONTO | migration `20260909120000`; `mobile/src/vehicle-documents.ts`, `mobile/src/VehicleDocumentsScreen.tsx`; `mobile/tests/vehicle-documents.test.mjs` | `cd mobile && pnpm test && pnpm typecheck` | Idem |
| Histórico/garantias/pós-venda | PRONTO | `app/demo/cliente/historico`; `app/demo/cliente/garantias`; leitura de `service_requests` + `service_quotes` | `pnpm test` | — |
| Notificações SLA — n8n | BLOQUEADO — interno; requer gate para produção | `docs/operations/n8n-notifications.md`; `services/n8n`; migration `20260820032446`; `tests/n8n-notifications.test.mjs` | `pnpm test` | **Human Gate**: aprovar workflow/transporte externo e habilitar `N8N_NOTIFICATIONS_ENABLED` conforme o runbook |
| WhatsApp — canal piloto | BLOQUEADO — ativação controlada | `docs/runbooks/whatsapp-alpha-activation.md`; `services/whatsapp`; `tests/whatsapp-*.test.mjs`; migration `20260826193000` | `pnpm whatsapp:readiness` — local, sem efeitos externos | **Human Gate**: seguir `whatsapp-alpha-activation.md` — conta Meta/WABA, secrets, template, kill switch, 1 cliente consentido |
| Pagamentos reais | FUTURO — hoje somente sandbox | `services/payments-sandbox`; `tests/payments-sandbox.test.mjs`; `lib/customer-pilot-demo.ts` (`mode: sandbox/mock`); `docs/ship-verah/master-plan.md` | `pnpm test` | **Human Gate** de aprovação comercial/pagamentos; sandbox nunca apresentado como pagamento real |
| Histórico mobilidade/fuel/manutenção/energia — sob drift de schema remoto | BLOQUEADO | fallback na seção 5 | — | Usar o fluxo fallback documentado; nunca mascarar erro nem criar dados fictícios |
| App mobile completo — build/loja | BLOQUEADO | `mobile/eas.json`; `docs/ship-verah/release-1.0-build-readiness-checklist.md`; PR #221 | `cd mobile && pnpm check` | **Human Gates** de EAS/Apple/Google — seção 8. O Alpha 5 web/demo não depende de build; o mobile é superfície adicional sob os mesmos contratos |
| Produção Supabase | BLOQUEADO | `docs/runbooks/supabase-production-reconciliation.md` + `supabase-reconciliation-manifest.md` (#83) | `pnpm ci:database` — somente local isolado | **Human Gate**: reconciliar/migrar produção antes de qualquer uso de produção |

##  4. Checklists pré-atendimento e pós-atendimento

Aplicar **pré-atendimento** uma vez por cliente do Alpha — os primeiros 5 casos —
antes do primeiro `service_request`, e **pós-atendimento** ao concluir cada atendimento. Todos os registros de consentimento/custódia/incidente são **append-only** e exigem
`idempotency_key` única: reusar chave com payload igual retorna o mesmo ID; payload
diferente falha. Nunca editar ou excluir esses registros.



###  4.1 Pré-atendimento — por cliente

| # | Check | Contrato/evidência | Critério de pass |
| --- | --- | --- | --- |
| P1 | Identidade canônica | `user_profiles` + `verah_identities`/`customers` (#172); migrations `20260730150101`/`20260730153004`; teste `customer_identity_security.sql` | Cliente autenticado; `user_profiles.role = customer`; sem tabela/identidade paralela |
| P2 | Veículo na garagem com proveniência | `confirm_customer_vehicle` RPC-only (#139); `20260827040000`; teste `vehicle_onboarding_security.sql` | Veículo `active` na garagem da cliente; `data_source`, `lookup_provider`, `source_synthetic` e `customer_confirmed_at` preenchidos — sem insert direto |
| P3 | Binding atendimento → cliente → veículo | `service_requests.customer_id`/`vehicle_id`/`created_by`; `20260905001000` canonical identity; `secure_concierge_service_lifecycle` | Criação exige veículo confirmado e binding canônico; cliente só acessa os próprios atendimentos — RLS e `listCustomerServiceRequests` por `created_by` |
| P4 | Consentimento pilot informado | `record_pilot_consent_receipt` — 5 tipos; `decision = accepted`; `source_channel` em `app`/`whatsapp`/`concierge_assisted` | Para cada tipo: `presented_text_hash` = sha256 do texto apresentado ao cliente; `consent_version` fixa e versionada; supersession explícita quando o texto mudar; 5 receipts atuais por atendimento/veículo |
| P5 | Checklist de integridade do veículo — baseline | `record_vehicle_custody_event` `event_type='pickup'` — odômetro, nível de combustível, chaves/itens, danos visíveis | Evento `pickup` registrado com **evidência obrigatória** — `evidence_attachment_ids` não vazio; anexos privados em `service_attachments`, bucket `service-attachments`, visibilidade `operations` apenas |
| P6 | Consentimentos de rota/destino e coleta/entrega | `route_destination_boundary` + `vehicle_collection_return` | Registrados com texto apresentado e hash, decisão aceita |
| P7 | Prestador homologado ativo | `service_providers.status = 'active'` + proveniência — homologação e convites | Prestador listável em `listActiveProviders`/portal ativo; escopo e preço definidos por serviço/atendimento; nunca expor ranking/margem interna à cliente |
| P8 | Orçamento/clarificação e aprovação de preço separada | `save_service_quote_draft`/`submit_service_quote`; `approve_service_quote`; consent `separate_service_price_approval` | Cliente viu explicação simples e o valor antes de aprovar; decisão gravada com `customer_decision_note` quando aplicável; consentimento separado de preço registrado |

###  4.2 Pós-atendimento — por atendimento

| # | Check | Contrato/evidência | Critério de pass |
| --- | --- | --- | --- |
| Q1 | Devolução com evidência | `record_vehicle_custody_event` `event_type='return'` — odômetro, combustível, chaves, danos e **evidência obrigatória** | Evento `return` registrado; conferência VERAH presente — `concierge_confirm_service_completion` ou registro equivalente |
| Q2 | Conclusão canônica | `provider_mark_service_completed` + `concierge_confirm_service_completion` | `service_stage = concluido`; `provider_completed_at`, `concierge_confirmed_at`, `completed_at` preenchidos |
| Q3 | Ocorrências/incidentes registrados | `open_service_incident` + `record_service_incident_action` — severidade S0–S4; status `open`→`contained`→`resolved`→`closed`; `communication_status`; `rework`; evidências | Nenhum incidente conhecido ficou sem dono, sem status e sem trilha de eventos; rework explicitamente registrado quando ocorreu |
| Q4 | Satisfação — quando suportado | `submit_service_rating` — `customer_rating`, `customer_feedback` | Rating registrado via RPC se a cliente forneceu; `customer_rated_at` preenchido; não inventar satisfação |
| Q5 | Histórico/pós-venda atualizado | `next_service_date`/`next_service_mileage`/`last_service_at`; `register_vehicle_maintenance` (#216) se aplicável; documento do veículo (#217) se aplicável | Próximo cuidado derivado de campos canônicos; manutenção canônica gravada com regra de custo — `create_expense` sem duplicar despesa; documentos com proveniência |
| Q6 | Evidências e auditoria | `service_attachments` — checksum sha256,bucket privado; `service_request_events` append-only; `pilot_concierge_time_entries` manual e idempotente | Trilha auditável completa do atendimento; anexos `available` e privados; nenhum dado fictício misturado a dados reais |

##  5. Fallback de demonstração/Alpha — drift de schema remoto

Quando `vehicle_mileage_logs`, `vehicle_fuel_logs`, `vehicle_charging_logs`,
`vehicle_expenses`, `vehicle_maintenance_records` e `vehicle_documents` estiverem
**indisponíveis por drift de schema remoto** — migrations da `main` ainda não aplicadas
no ambiente alvo — o fluxo seguro continua **sem mascarar erro e sem criar dados
fictícios**.



###  5.1 Fluxo que sempre funciona — independente do drift

1. **Login/home** — auth e identidade canônica — `user_profiles`, `verah_identities`
   e `customers` — são canônicos e nunca dependem das tabelas drifted..
2. **Garagem** — `customer_vehicles` leitura via RLS owner-based, criação RPC-only
   (#139) continuam; campos opcionais (`current_mileage`, `next_service_date`, …) são
   lidos como `null` ou "Ainda não informado" quando ausentes — **nunca como zero**
   inventado..
3. **Pedir ajuda** — `createServiceRequest` + triagem determinística + `service_stage`
   canônico funcionam sem as tabelas drifted; `mileage_snapshot` fica `null` quando
   não houver km disponível..
4. **Concierge** — aceite, prioridade, indicação de prestador, orçamento/proposta e
   aprovação usam `service_requests`, `service_quotes` e `service_providers` — canônicos..
5. **Custódia/leva & traz** — consentimento e eventos de custódia usam
   `pilot_consent_receipts` e `vehicle_custody_events`; o campo `odometer_km` do
   evento de custódia é **obrigatório** no RPC — se o odômetro real não estiver
   disponível, registrar **pendência humana explícita** — não zerar, não chutar —
   antes do `pickup`..

###  5.2 Comportamento degradado esperado

| Capacidade drifted | Comportamento correto — fail-closed | Proibido |
| --- | --- | --- |
| Logs/históricos de km, combustível, recarga, despesas, manutenção e documentos | Leitura retorna erro → a UI exibe estado explícito de erro/indisponibilidade. O mobile **distingue falha de leitura de lista vazia** — `error` vs `data: []`; ex.: `maintenanceByVehicle[id] = null` separado de `[]`; telas `FuelHistoryScreen`/`MaintenanceScreen` exibem `error` com `accessibilityRole="alert"`. O fluxo principal — login/home/garagem/pedir ajuda/concierge — continua funcional | Mascarar como sucesso; trocar erro por lista vazia inventada; preencher km/combustível/manutenção fictícios; marcar dado sintético/demo como real; bloquear o app inteiro por falta de dado opcional |
| Campos opcionais de `customer_vehicles` — km atual, próximo cuidado | Ausente = "Ainda não informado" ou `null`; a UI segue | Zerar ou inventar datas/km |
| `mileage_snapshot` do atendimento | `null` quando não houver km canônico | Gravar snapshot fictício |
| Registro de energia/manutenção — save | Erro claro e inofensivo; dados locais do formulário preservados para retry idempotente — `idempotency_key` derivada de veículo/tipo/data/km | Sucesso silencioso; gravação parcial; duplicar registros |
| Custódia com odômetro indisponível | Pendência humana explícita registrada antes do `pickup`/`return`; evidência fotográfica ainda obrigatória | Seguir sem registro; zerar odômetro; inventar combustível |

Regra de ouro:a demonstração/Alpha **nunca representa fixture sintética**
— `lib/customer-pilot-demo.ts`, `services/vehicle-intelligence/local-provider.ts`,
`services/payments-sandbox/*` — como realidade de produção;; erros são visíveis e
acionáveis;; e nenhum dado fictício é gravado como real..

##  6. Métricas do piloto

Derivar **sem novo schema**; separar o que é derivável hoje do que ainda
não é. Todas as fontes abaixo existem na `main`..


| Métrica | Derivável? | Fonte/derivação | Nota |
| --- | --- | --- | --- |
| Tempo de primeira resposta | Sim | `concierge_accepted_at - created_at` em `service_requests`; SLA por estágio em `lib/concierge-operations.ts` — `getSla`, `SLA_ATTENTION_AFTER_MS`, `SLA_OVERDUE_AFTER_MS` | Disponível por atendimento; agregável por média/p50 sem schema novo |
| Tempo de coordenação | Sim | `provider_assigned_at - concierge_accepted_at` em `service_requests`; `reopenedAt` entra no relógio relevante via `getRelevantTimestamp` | Considerar reaberturas; registrar fases manuais via `record_pilot_concierge_time` quando quiser decompor |
| Tempo de conclusão | Sim | `completed_at - created_at`; RPC `get_pilot_alpha_metrics` → `completion_time_minutes`; duração de custódia `pickup_return_duration_minutes`; `km_during_custody` | Já computado e testado por `pilot_alpha_custody_security.sql` |
| Satisfação | Sim — quando suportado | `customer_rating`/`customer_feedback`/`customer_rated_at` via `submit_service_rating`; `get_pilot_alpha_metrics.customer_feedback_recorded` | Somente quando a cliente avaliou; nenhuma inferência a partir de outros sinais |
| Reincidência/retorno | Parcial | `reopen_service_request` — `reopenedAt`, `reopenReason` — e múltiplos atendimentos por `customer_id`/`vehicle_id` — contagem por placa/veículo ao longo do tempo | Reabertura é retorno real rastreável; **retorno futuro** — mesma dor semanas depois; novo atendimento — é derivável somente como contagem de atendimentos por veículo/cliente; não existe tabela de "recorrência" hoje |
| Incidentes e rework | Sim | `service_incidents` — severidade, status, comunicação; `record_service_incident_action` — eventos append-only e flag `rework`; `get_pilot_alpha_metrics` — `incident_count`, `incidents_by_severity`, `rework_occurred` | Obrigatório para o Alpha — custódia exige evidência, autorização e incidentes |
| Tempo manual por fase | Sim — registro manual existente | `pilot_concierge_time_entries` via `record_pilot_concierge_time` — fases `intake`, `triage`, `provider_coordination`, `pickup`, `quote_review`, `execution`, `return`, `incident`, `follow_up`; idempotente e append-only; consumido por `get_pilot_alpha_metrics` — minutos por fase | É a primitiva **segura** de registro manual; não criar tabela nova |
| **Ainda não deriváveis hoje** | Não | — | Custo real — pagamentos são sandbox; latência de mensagens reais — WhatsApp atrás de gate; eficiência da rede vs margens internas — não expor; recorrência com diagnóstico — não há motor de diagnóstico; LTV/NPS; tempo de execução real do prestador — `pilot_concierge_time_entries` não mede o prestador |

##  7. Checklist de readiness executável — repository-safe

| # | Check | Comando — repository-safe | Resultado neste executor | Gate? |
| --- | --- | --- | --- | --- |
| 1 | Testes web | `pnpm test` | **282/282 pass** | — |
| 2 | Typecheck web | `pnpm typecheck` | **ok** | — |
| 3 | Lint web | `pnpm lint` | **ok** — 1 warning pré-existente não-bloqueante | — |
| 4 | Build Next | `pnpm build` | **ok** | — |
| 5 | Pipeline aplicação completa | `pnpm ci:application` | executada no CI da PR (componentes acima verdes) | — |
| 6 | Testes mobile | `cd mobile && pnpm test` | **80/80 pass** | — |
| 7 | Typecheck mobile | `cd mobile && pnpm typecheck` | **ok** | — |
| 8 | Expo Doctor | `cd mobile && pnpm dlx expo-doctor@1` | **20/20 checks pass** | — |
| 9 | Banco/autorização local | `pnpm ci:database` — Supabase CLI + Docker locais; **nenhum banco remoto** | executada no CI da PR | — |
| 10 | WhatsApp readiness local | `pnpm whatsapp:readiness` — local; sem mensagens reais | depende de env local | — |
| 11 | Replay/validação de migrations só no ambiente alvo | Nenhum comando deste runbook aplica migration remota | — | **HUMAN GATE** #83 |
| 12 | Ativar o piloto com clientes reais | Nenhum comando deste runbook cria clientes, veículos ou atendimentos reais, nem envia mensagens | — | **HUMAN GATE** — fundador; ver seção 8 |

A **fonte da verdade** dos checks executáveis é o CI da PR — `CI / Application` e
`CI / Database authorization`; ver `docs/ci.md`. Os comandos acima são os mesmos
usados localmente para reprodutibilidade..

##  8. Human Gates explícitos— fail-closed — ação mínima exata

| # | Gate | Dono | Ação mínima exata | Impede |
| --- | --- | --- | --- | --- |
| 1 | **Ativação do piloto** | Fundador | Selecionar até 5 clientes reais consentidos em Franca/SP; cadastrá-los pelas rotas canônicas existentes — auth, onboarding, garagem —; registrar os 5 consentimentos pilot por atendimento via `record_pilot_consent_receipt`, com `source_channel` e hash do texto apresentado | qualquer operação real do Alpha |
| 2 | **Produção Supabase** | Fundador | Executar `docs/runbooks/supabase-production-reconciliation.md` + `supabase-reconciliation-manifest.md` (#83) — reconciliar, aplicar migrations revisadas e validar schema/RLS antes de qualquer uso de produção | banco/alvo de produção; aplicação de migrations remota |
| 3 | **Prestadores/homologação reais** | Fundador/Concierge | Homologar prestadores ativos em Franca pelas rotas existentes — `service_providers.status='active'`, homologação `20260826150710` e convites `20260819192003` — com documento/proveniência | rede real de prestadores no piloto |
| 4 | **Pagamentos reais** | Fundador | Aprovar fluxo financeiro real e integrar provedor de pagamentos — hoje apenas `payments-sandbox` | cobrança real/movimentação financeira |
| 5 | **Mensagens reais — WhatsApp/n8n** | Fundador | Seguir `docs/runbooks/whatsapp-alpha-activation.md` — conta Meta/WABA, secrets no secret manager, template aprovado, kill switch, 1 cliente consentido — e aprovar o workflow n8n — `docs/operations/n8n-notifications.md` | envio de mensagem real; ativação de canal |
| 6 | **App/loja — EAS/Apple/Google** | Fundador | Seguir `docs/ship-verah/release-1.0-build-readiness-checklist.md` — EAS login/build, Apple Developer, App ID, Play package, signing, submissão — e PR #221 | build EAS; TestFlight/Play; publicação |
|  7 | **Demo/dados sintéticos** | Fundador | Nunca representar fixture/demo como produção — regra do repositório; dados reais do Alpha exigem os checks da seção 4 | contaminação de dados reais por sintéticos |

##  9. Riscos e não-escopo

**Riscos:** drift de schema remoto — fallback na seção 5;; ativação de produção sem
reconciliação — #83;; exposição de ranking/margem interna de prestadores à cliente —
proibido; enfraquecer os controles de custódia — evidência, autorização, incidentes —
são invariantes do repositório;; misturar fixture sintética com dados reais;; segunda máquina
de estado de tracking — proibido; `lib/customer-service-stage.ts` é a projeção canônica..
**Não-escopo:** banco remoto/migration push/repair/reconciliation;; secrets;; produção/
deploy/promotion;; pagamento ou mensagem real;; App ID/signing/submissão/publicação;;
merge;; código das PRs Draft #233/#234/#236..

**Convergência — #176:** esta issue reutiliza as classificações do mapa: identidade —
REUTILIZAR;; onboarding/garagem — já implementado —; service requests — existe completo —
EXPOR/REUTILIZAR;; concierge/leva-e-traz — REUTILIZAR operação com custódia obrigatória;;
prestador — REUTILIZAR;; histórico/documentos — parcial, com NOVO já entregue em
#216/#217;; quilometragem/combustível/custos — agora com logs #213/#214/#230/#215 e
dashboard;; notifications/WhatsApp/pagamentos — Human Gates.. Nenhuma capacidade nova é
criada por esta issue.