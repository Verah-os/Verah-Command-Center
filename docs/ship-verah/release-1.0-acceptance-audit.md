# Auditoria de aceitação — Release 1.0 (Issue #228)

Data: 2026-09-09. Base: `main` em `d5541e2` (após #211/#212/#213/#214/#215/#216/#217/#218
mergeados; CI verde no head — CI run #34330134195, success, `d5541e2`).
Método: cada afirmação cita caminho concreto do repositório; nenhuma capacidade
foi inferida de documentação aspiracional. Refs: #164, #211–#218, #83.

## Veredito executivo

O estoque atual da `main` entrega **todas as 11 capacidades do Release 1.0 (#164)**
na superfície mobile, consumindo exclusivamente os contratos canônicos Supabase
(auth/identidade, `customer_vehicles`/RLS/RPC, `service_requests`, quilometragem,
combustível, despesas/custo-por-km, manutenções/lembretes, documentos/histórico).

- **Validado neste executor:** 65 testes mobile (`mobile/tests/*.test.mjs`), typecheck
  mobile (`tsc --noEmit`), Expo Doctor 20/20, 282 testes Node web
  (`tests/*.test.mjs`), typecheck raiz, lint raiz, build Next.js e suíte SQL
  de autorização (`pnpm ci:database` — replay de 52 migrations, 40 testes
  SQL, schema lint public/private) — **tudo verde na `main` `d5541e2`**.
- **Nenhuma correção de regressão foi necessária** — a validação confirmou o
  estoque canônico e a CI verde do head.

### Sobre M1–M4

| Marco | Critério #164 | Estado |
| --- | --- | --- |
| M1 — VERAH no celular | Build instalável iOS e Android, identidade correta, autenticação, onboarding e garagem | **PASS (repository-safe)** — auth mobile (#169/#172), onboarding+garagem (#173/#174), build EAS non-prod (#181/#183/#184/#185), SDK 55 (#211/#212); a geração física do build exige conta humano EAS (ver checklist) |
| M2 — VERAH útil | Abastecimentos, custos, manutenção, lembretes, documentos, histórico e dashboard | **PASS (repository-safe)** — #213 (km), #214 (combustível/consumo), #215 (despesas/custo-por-km/dashboard), #216 (manutenções/lembretes), #217 (documentos/histórico seguro); tudo wired da home mobile |
| M3 — VERAH resolve | "Preciso de ajuda" integrado à operação VERAH; beta com usuárias reais | **PASS (backend/mobile, até Human Gate de beta real)** — `service_requests` canônico + pick-up (#190/#192/#193/#194/#196/#197); beta com usuárias reais é **Human Gate/M4** (TestFlight/APK fechado) |
| M4 — Distribuição | TestFlight + teste Android → correções → App Store + Google Play | **GATE (Humano)** — exigido contas Apple/Google, signing, App ID/package de produção e publicação; nenhuma ação externa executada. Checklist em `docs/ship-verah/release-1.0-build-readiness-checklist.md`. |

## Matriz de capacidades Release 1.0 (PASS / PARTIAL / GATE / GAP)

Legenda: **PASS** = plenamente wired/acionado com evidência de teste; **PARTIAL** =
parcial por escopo (ex.: sem push notifications); **GATE** = exigido conta/ação humana
externa para completar; **GAP** = ausente/requer trabalho repo-safe.



| # | Capacidade #164 | Estado | Evidência (caminhos concretos) |
| --- | --- | --- | --- |
| 1 | Cadastro / login | **PASS** | Supabase Auth email/senha + Google OAuth (`mobile/src/AuthScreen.tsx`, `mobile/src/auth-session.ts`, `mobile/src/supabase.ts` `signInWithPassword`/`signUp`/`signInWithGoogle`/`signInWithOAuth`); contrato identidade `user_profiles`/`verah_identities` — migrations `20260712210000`, `20260730150101`, `20260730153004`; teste `mobile/tests/auth-session.test.mjs`, `supabase/tests/customer_identity_security.sql`) |
| 2 | Onboarding | **PASS** | RPCs canônicos `start_customer_onboarding`, `complete_customer_basic_onboarding`, `refresh_customer_onboarding` (`mobile/src/supabase.ts:247–260`; migration `20260827013000`; `mobile/src/customer-journey.ts` `ONBOARDING_TERMS_VERSION = "pilot-alpha-onboarding-v1"`; teste `mobile/tests/customer-journey.test.mjs`; `supabase/tests/identity_onboarding_security.sql`) |
| 3 | Cadastrar veículo / garagem | **PASS** | `customer_vehicles` RLS owner-based + criação RPC-only `confirm_customer_vehicle` (`mobile/src/supabase.ts:262–275` (p_lookup_source='manual', p_customer_confirmed=true); migrations `20260716000000`, `20260827040000`; teste `mobile/tests/vehicle-catalog.test.mjs`, `mobile/tests/customer-journey.test.mjs`, `supabase/tests/vehicle_onboarding_security.sql`) |
| 4 | Quilometragem | **PASS** | `vehicle_mileage_logs` canônico + RPC `register_vehicle_mileage` (`mobile/src/supabase.ts:323–345`; migration `20260907000000`; tela `mobile/src/MileageHistoryScreen.tsx`; teste `mobile/tests/mileage-log.test.mjs`; `supabase/tests/vehicle_mileage_logs_security.sql`) |
| 5 | Abastecimentos e consumo | **PASS** | `vehicle_fuel_logs` canônico + RPC `register_vehicle_fuel` com `consumption_kmpl` (`mobile/src/supabase.ts:347–375`; migration `20260907120000`; tela `mobile/src/FuelHistoryScreen.tsx`; teste `mobile/tests/fuel-log.test.mjs`; `supabase/tests/vehicle_fuel_logs_security.sql`) |
| 6 | Despesas e custo por km | **PASS** | `vehicle_expenses` canônico + função `vehicle_expense_summary` (RPC, `p_period_start`/`p_period_end`) derivando `costPerKmCents` (`mobile/src/supabase.ts:312–329`; migration `20260908000000`; dashboard `mobile/src/CustomerHome.tsx` `ExpensesDashboard` "Quanto meu carro me custa?"; teste `supabase/tests/vehicle_expenses_security.sql`) |
| 7 | Manutenções | **PASS** | `vehicle_maintenance_records` canônico + RPC `register_vehicle_maintenance` com `create_expense` integrado a `vehicle_expenses` (`mobile/src/supabase.ts:229–243`; migration `20260909005541`; tela `mobile/src/MaintenanceScreen.tsx`; teste `mobile/tests/maintenance.test.mjs`; `supabase/tests/vehicle_maintenance_security.sql`) |
| 8 | Lembretes por data/km | **PASS (derivação local; push = GATE)** | `deriveMaintenanceReminders` puro/testado (`mobile/src/maintenance.ts`; teste `mobile/tests/maintenance.test.mjs` — thresholds inclusivos, superação por data ou km) sobre os campos canônicos `occurred_on`/`next_due_on`/`odometer_km`/`next_due_km`; exibição em `CustomerHome.tsx` `MaintenanceSummary`; **push notifications fora do 1.0 até gate de credenciais FCM/APNs** (`docs/ship-verah/audit-release-1.0.md` "Riscos") |
| 9 | Documentos/notas/histórico | **PASS** | `vehicle_documents` canônico + Storage bucket privado owner-based + RPCs `register_vehicle_document`/`remove_vehicle_document` (`mobile/src/supabase.ts:377–431`; migrations `20260909120000`; tela `mobile/src/VehicleDocumentsScreen.tsx`; teste `mobile/tests/vehicle-documents.test.mjs`; `supabase/tests/vehicle_documents_security.sql`); histórico de atendimentos: leitura RLS de `service_requests` em `CustomerHome.tsx` (`completed` / abas "Histórico") |
| 10 | Dashboard "Quanto meu carro me custa?" | **PASS** | `vehicle_expense_summary` RPC consumido por `ExpensesDashboard` em `mobile/src/CustomerHome.tsx` (total, contagem, distância válida, custo por km, períodos 30/90/tudo) |
| 11 | CTA "Preciso de ajuda" conectado à jornada VERAH | **PASS** | `service_requests` canônico + identidade de cliente canônica (`customer_id` via trigger/backfill `20260905001000_canonical_service_request_customer_identity.sql`) + pick-up local (`20260904022000_service_request_pickup_location.sql`); mobile `createMobileServiceRequest` (`mobile/src/service-request-supabase.ts` — insert direto sob RLS de criação por cliente) + telas `CustomerRequests.tsx`; projeção de estágio `lib/customer-service-stage.ts`; teste `mobile/tests/service-request.test.mjs`; `supabase/tests/communication_intake_security.sql`) |

### Fora do 1.0 (confirmado, não-duplicar)

Saúde/Score do veículo, Vehicle Intelligence/recalls, OCR, concierge completo/leva-e-traz,
rede homologada, pagamentos/assinaturas e automações avançadas continuam fora do Release
1.0 — ver `docs/ship-verah/audit-release-1.0.md` e
`docs/ship-verah/master-plan.md`.

## Verificações de validação (executadas sobre `main` `d5541e2`)

| Check | Comando | Resultado |
| --- | --- | --- |
| Testes Node web | `pnpm test` | **282 pass, 0 fail** |
| Typecheck web | `pnpm typecheck` | **ok** |
| Lint web | `pnpm lint` | **ok** (1 warning não-bloqueante existente `app/demo/prestador/atendimento/[id]/page.tsx`) |
| Build Next.js | `pnpm build` | **ok** |
| Testes mobile | `cd mobile && pnpm test` | **65 pass, 0 fail** |
| Typecheck mobile | `cd mobile && pnpm typecheck` | **ok** |
| Expo Doctor | `cd mobile && pnpm dlx expo-doctor@1` | **20/20 checks passed** |
| CI de banco (autorização RLS/migrations) | `pnpm ci:database` (com Supabase CLI 2.110.0 e Docker local descartável) | **Database authorization CI completed successfully** (52 migrations, 40 arquivos SQL de teste, lint public/private) |
| CI remoto da `main` (GitHub Actions) | run #34330134195 | **success** (`d5541e2`) |

## Invariantes preservados (verificação de não-duplicação)

- **Identidade canônica:** mobile usa `user_profiles`/`verah_identities`/`customers`
  e auth providers como métodos de login; nenhuma tabela/estado de usuário paralelo.

- **Veículo RPC-only:** `confirm_customer_vehicle`/`replace_customer_vehicle` —
  insert direto em `customer_vehicles` continua revogado de `authenticated`.
- **`service_request` canônico:** criação via PostgREST sob RLS de criação por cliente,
  com `customer_id`+`created_by` e trigger de identidade canônica
  (`20260905001000`); tracking da cliente é projeção de `service_stage`, não segunda
  máquina de estado (`lib/customer-service-stage.ts`).
- **Quilometragem/combustível/despesas/manutenções/documentos:** somente RPCs
  canônicos + RLS owner-based + testes SQL de segurança; nada de insert direto
  fora da política.

- **Nenhuma produção, secret, pagamento/mensagem real, migração remota ou
  operação destrutiva foi executada neste auditoria.**

## GAPs restantes (somente evidência-embasados, dependência-ordenados)

Nenhum GAP de código repo-safe permanece para o Release 1.0 funcional em
ambiente não-prod — todas as capacidades M1–M3 estão wired e testadas. Os únicos
itens restantes são **Human Gates** (M4/distribuição e beta real), detalhados no
checklist de build-readiness. Nenhuma issue nova de backlog é criada por esta auditoria;
os gates são documentados, não duplicados.


| Gate | Dono | Ação humana exigida | Quando |
| --- | --- | --- | --- |
| Conta Expo/EAS do fundador | Fundador | `eas login` / `EXPO_TOKEN` + `eas build:configure` | antes do primeiro build EAS |
| Apple Developer (certificado/provisioning) | Fundador | criar conta/programa Apple Developer; `ios.simulator: false` + `eas credentials` | build iOS em dispositivo físico / TestFlight |
| Apple App ID / bundle de produção | Fundador | registrar bundle `com.verah.app` (ou equivalente de produção) no Apple Developer | antes de TestFlight |
| Google Play Console (package de produção) | Fundador | registrar package `com.verah.app` (ou equivalente) no Play Console | antes de internal testing / produção |
| Variáveis públicas EAS (não-prod) | Fundador | `eas env:create --name EXPO_PUBLIC_SUPABASE_URL` e `--name EXPO_PUBLIC_SUPABASE_ANON_KEY` (valores não-prod, nunca secrets) | antes de build EAS |
| Publicação App Store / Google Play | Fundador | assinar, submeter e publicar (fora do escopo deste audit) | M4/HUMAN gate final |
| Ativação de produção no Supabase | Fundador | ativar/migrar banco de produção conforme `docs/runbooks/supabase-production-reconciliation.md` (#83) | antes de produção real |