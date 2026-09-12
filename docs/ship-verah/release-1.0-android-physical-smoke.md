# Release 1.0 — Pack de smoke-test físico Android (pós-gate de schema não-prod)

Data: 2026-09-12. Base: `main` em `be65bcb` (`#236/#239/#240` merged; `#252` staging-migrations runbook merged). Refs: #164, #228/#229, #233, #239, #244, #245, #252. PRs Draft abertas: **#244/#248/#250/#254/#255/#258** — **nenhum arquivo tocado por elas é alterado aqui** (verificado por diff contra cada head; zero overlap de paths). #242 permanece aberta (non-draft, repository-safe docs+SQL+CI; também sem overlap)。

## 0. Escopo, gate e invariantes

**Status do Human Gate de staging:** **concluído** — as 53 migrations canônicas estão
aplicadas no Supabase **não-produtivo** usado pelo preview APK, e o histórico Local/
Remote está alinhado até `20260910000000_vehicle_charging_logs`. Este pack permanece
**documentação e validação repository-safe somente** — **não executa nenhuma ação externa**:
nenhum banco remoto, push/repair/reconciliation/aplicação de migration, secret,
produção/deploy/promotion, pagamento ou mensagem real, App ID/package/signing/
submissão/publicação ou merge. As migrations não-prod revisadas (`#252`; Human Gate `#83`)
já aplicadas por humano — este artefato **não as re-aplica** e **não as toca**. O
**Human Gate separado** continua sendo o único executor autorizado de migrations
remotas (não executado por este pack; ver `docs/runbooks/supabase-production-reconciliation.md`
+ `docs/runbooks/supabase-reconciliation-manifest.md`, aplicável também ao alvo não-prod
pela mesma regra de gate).

**Dependências abertas antes do teste físico (recomendado: aguardar a resolução):**

- **#244** (Draft, base `d391782`): fail-closed de disponibilidade independente combustível/recarga + home fail-closed. É o alvo canônico dos checks **R3**, **R2** e **G6**. Até esta PR ser merged e rebased no `main` deste pack, o `FuelHistoryScreen` na `main` ainda retorna no **primeiro erro** entre as duas fontes (uma fonte indisponível esconde a outra e pode vazar texto cru de schema-cache). **Sem ela, R3/R2/G6 não podem ser GO.**
- **#254** (Draft): pack de copy UX/accessibility — reescreve strings citadas neste pack
(em `mobile/App.tsx` `FailClosedNotice` — passo 1 — e em `mobile/src/service-request-supabase.ts` — mensagem de falta de config, passo 12). Se #254 entrar antes, atualizar as aspas deste pack para a copy final; não bloqueia a sequência se ajustado.

- **#255** (Draft, DS V1): em mobile, altera **somente tokens de cor** (`Styles/`colors) nas telas/StyleSheets — **nenhum string/lógica/contrato** é tocado nas telas referenciadas por este pack. Nenhum asserção deste pack depende de cor; **sem impacto**.
- **#248/#250/#258** (Docs, Draft): packs de iOS-readiness, merge-sequencing e integration-map-refresh — **zero overlap** de arquivos com este pack; **sem impacto**.

**Pré-condições para executar este smoke test (todas Human Gates prévios):**

| # | Pré-condição | Evidência/referência |
| --- | --- | --- |
| P1 | Build APK `preview` instalável gerado (EAS, conta humana) e instalado no dispositivo | `docs/ship-verah/release-1.0-build-readiness-checklist.md`; `mobile/eas.json` (profile `preview`, `buildType: apk`) |
| P2 | Variáveis públicas EAS `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` apontando ao projeto **não-prod** | `docs/ship-verah/release-1.0-build-readiness-checklist.md`; `mobile/src/config.ts` (fail-closed; nunca service role) |
| P3 | Migrations não-prod revisadas **aplicadas e alinhadas** no Supabase usado pelo preview (Local/Remote alinhado até `20260910000000_vehicle_charging_logs`) | **Concluído** (Human Gate `#83` + runbook `#252`); `supabase/migrations/` (53 arquivos, lista nas referências) |
| P4 | Dispositivo Android físico com instalação de fontes desconhecidas liberada e rede | — |

**Invariantes preservados:** Supabase canônico como única fonte da verdade, identidade
`user_profiles`/`verah_identities`/`customers` canônica (auth provider é método de
login, não identidade), `customer_id`/veículo ownership/`service_request`,
quilometragem, combustível/recarga (litros e kWh **distintos**, sem conversão inventada),
despesas, manutenções, documentos, RLS/auth e fail-closed (nenhuma fonte
indisponível vira dado fictício, nenhum erro cru de backend aparece ao cliente).

**Captura de evidência:** somente **tela/resultado** — screenshots/screen recording, sem
PII, sem endereço/coordenadas completas de terceiros, sem secrets, sem SQL ou
detalhe de schema. Ao compartilhar um vídeo com tela de atendimento, **desfoque** endereço
e coordenadas da localização de retirada e mantenha somente o necessário da jornada..

## 1. Sequência determinística do smoke test

Legenda: **Resultado esperado** = o que a cliente vê; **Primitiva canônica** =
contrato/estado/evidência no repositório que sustenta o passo; **Fail-safe** = comportamento
exigido quando a fonte canônica estiver indisponível/negada/erro; **Evidência** = o que capturar..

| # | Ação do testador | Resultado esperado (cliente) | Primitiva canônica | Fail-safe (proibido entre parênteses) | Evidência a capturar |
| --- | --- | --- | --- | --- | --- |
| 1 | Instalar o APK `preview` e abrir | Tela inicial VERAH (auto-branding desenvolvimento "VERAH Dev"); se Supabase público não configurado, aviso explícito de build de desenvolvimento — nunca texto cru | `mobile/eas.json`; `mobile/App.tsx` (`FailClosedNotice`); `mobile/src/config.ts` | Fail-closed: sem variáveis válidas → nenhuma chamada de backend; aviso claro (nunca fingir sucesso; nunca mostrar textos de erro de ambiente ao cliente) | Screenshot da home inicial |
| 2 | Login/cadastro: email/senha (e, se habilitado, Google OAuth) | Tela de autenticação VERAH; sessão restaurada ("Restaurando sessão…") ao reabrir | `mobile/src/AuthScreen.tsx`; `mobile/src/auth-session.ts` (estado `loading`/`signed-in`/`signed-out`); `mobile/src/supabase.ts` (`signInWithPassword`/`signUp`/`signInWithOAuth`, `handleAuthUrl` via `verah-dev://auth/callback`); `user_profiles`/`verah_identities` (`20260712210000`, `20260730150101`, `20260730153004`); testes `mobile/tests/auth-session.test.mjs`, `supabase/tests/customer_identity_security.sql` | Erro de login/cadastro exibido com copy amigável (sem detalhe de SQL/schema/cache); sessão expirada → volta para login sem estado órfão local | Screenshot da tela logada (sem senha visível) |
| 3 | Onboarding + garagem: perfil básico e termos Pilot Alpha v1; recuperação de jornada existente | "Vamos preparar sua VERAH" com nome de preferência e termos v1; cliente que já passou cai direto na etapa correta (perfil → veículo → garagem → home) | `mobile/src/CustomerJourney.tsx` (`BasicProfileStep`); `mobile/src/customer-journey.ts` (`ONBOARDING_TERMS_VERSION = "pilot-alpha-onboarding-v1"`, `refresh_customer_onboarding`/`start_customer_onboarding`/`complete_customer_basic_onboarding`; migration `20260827013000_identity_onboarding_foundation.sql`; testes `mobile/tests/customer-journey.test.mjs`, `supabase/tests/identity_onboarding_security.sql` | Falha na restauração → estado de erro com "Tentar novamente" e "Sair" (nunca inventar etapa; nunca aceitar termos sem aceite explícito) | Screenshots das etapas de perfil e veículo |
| 4 | Veículo na garagem e **recuperação de veículo existente**: cadastrar manualmente (marca/modelo/ano/placa válida) e confirmar | Veículo aparece na garagem/home como principal ("Meu veículo", km informativo); em novo login, o mesmo veículo continua lá (dado canônico do backend, não local) | `confirm_customer_vehicle` RPC-only com `p_lookup_source='manual'`, `p_customer_confirmed=true` (`mobile/src/supabase.ts`); `customer_vehicles` RLS owner-based, `active` ordenado por `created_at` (`mobile/src/customer-journey.ts` `listVehicles`); migrations `20260716000000_create_customer_vehicles.sql`, `20260827040000_vehicle_onboarding.sql`; testes `mobile/tests/vehicle-catalog.test.mjs`, `mobile/tests/customer-journey.test.mjs`, `supabase/tests/vehicle_onboarding_security.sql` | Erro de validação/save com copy amigável; leitura falha → erro explícito com retry (nunca garagem "zerada" por falha; insert direto continua proibido de `authenticated`) | Screenshots da garagem antes/depois |
| 5 | Multi-veículo: CTA "+ Adicionar veículo" na aba Veículos; substituir/remover | Garagem com múltiplos veículos; "Substituir"/"Remover" com confirmação explícita; ao remover, o histórico de atendimentos é preservado | `CustomerHome.tsx` (aba veículos, `onAddVehicle`, `onReplaceVehicle`, `onDeactivateVehicle`); `mobile/src/CustomerJourney.tsx` (`VehicleOnboardingStep` `additional`/`replacing`); `replace_customer_vehicle` RPC (migration `20260907141500_vehicle_replacement_preserving_history.sql`); testes `mobile/tests/vehicle-replacement.test.mjs`, `supabase/tests/vehicle_replacement_security.sql` | Falha → copy amigável e estado consistente (nunca perder vínculos de histórico; nunca expor veículos de outra cliente) | Screenshots da aba veículos, fluxo de substituição |
| 6 | Home/dashboard "Quanto meu carro me custa?": períodos 30/90/Tudo | Custo total, nº de despesas, distância válida e custo por km ("—" se sem km válido); troca de período atualiza | `mobile/src/CustomerHome.tsx` (`ExpensesDashboard`); RPC `vehicle_expense_summary` (`mobile/src/supabase.ts` `expenseForVehicle`); `vehicle_expenses` (migration `20260908000000_vehicle_expenses_dashboard.sql`); teste `supabase/tests/vehicle_expenses_security.sql` | Sem resumo → área ausente/neutra, sem valor inventado; falha da agregação não bloqueia Home (nunca mostrar 0/— como se houvesse dado quando a fonte falhou) | Screenshots do dashboard (sem dados pessoais de terceiros) |
|  |7 | Energia: abrir "Abastecimentos e recargas" e alternar **Combustão** / **Elétrico** | Modo Combustão registra litros (**L**) e mostra consumo **km/L** quando há intervalo válido; modo Elétrico registra **kWh** e mostra eficiência **km/kWh**; litros nunca viram kWh e vice-versa; histórico exibe unidade correta por entrada | `mobile/src/FuelHistoryScreen.tsx` (modos Combustão/Elétrico, unidades `L`/`kWh` independentes); `vehicle_fuel_logs` + `register_vehicle_fuel` (`20260907120000`); `vehicle_charging_logs` + `register_vehicle_charging` (`20260910000000`); testes `mobile/tests/fuel-log.test.mjs`, `mobile/tests/charging-log.test.mjs`, `mobile/tests/energy-history.test.mjs`, `supabase/tests/vehicle_fuel_logs_security.sql`, `vehicle_charging_logs_security.sql` | Fonte indisponível não esconde a outra (modos independentes); sem intervalo válido → "Sem intervalo válido…" sem inventar consumo; save falha → erro amigável e formulário preservado (idempotência por veículo/data/hodômetro) | Screenshots dos dois modos e respectivos históricos |
| 8 | Manutenção + recibo assistido: anexar foto/nota do recibo, "Usar rascunho assistido", revisar e **confirmar explicitamente** | Rascunho assistido popula **somente** campos editáveis (data, nota); nenhum km/valor/datas extraído de foto/OCR; o save canônico exige diálogo "Confirmar rascunho assistido?" e confirmação da cliente; recibo vira documento privado do veículo somente após o save | `mobile/src/MaintenanceScreen.tsx` (fluxo assistido + confirmação); `mobile/src/maintenance-assist.ts` (`buildMaintenanceAssistedDraft` — sem extração de foto; `shouldConfirmAssistedSave`); `vehicle_maintenance_records` + `register_vehicle_maintenance` com `create_expense` (`20260909005541`); testes `mobile/tests/maintenance.test.mjs`, `mobile/tests/maintenance-assist.test.mjs`, `supabase/tests/vehicle_maintenance_security.sql` | Recibo > 10 MiB → erro amigável; falha de save → erro e nenhuma gravação parcial sem confirmação (nunca persistir valores sugeridos/extraídos automaticamente; nunca salvar sem a confirmação explícita) | Screenshot do diálogo de confirmação e da tela preenchida |
| 9 | Lembretes: verificar "Manutenções" na Home e na aba veículos | Reminders "Vencidas / vencem hoje" e "Próximas" derivados de `next_due_on`/`next_due_km`, thresholds inclusivos; sem km atual → aviso "Registre a quilometragem para avaliar os lembretes por km" | `mobile/src/maintenance.ts` (`deriveMaintenanceReminders` puro); `mobile/src/CustomerHome.tsx` (`MaintenanceSummary`); campos canônicos `occurred_on`/`next_due_on`/`odometer_km`/`next_due_km`; teste `mobile/tests/maintenance.test.mjs` | Lembretes derivados somente de dados canônicos; leitura de manutenções falha → área mostra indisponibilidade com retry (nunca lembretes falsos/zerados); push fora do 1.0 até gate FCM/APNs | Screenshot da área de manutenções |
| 10 | Documentos privados do veículo | Adicionar/remover documentos (PDF/JPEG/PNG/WebP até 10 MiB); lista ordenada; "O arquivo foi enviado com acesso privado, sem URL pública" | `mobile/src/VehicleDocumentsScreen.tsx`; `mobile/src/vehicle-documents.ts` (`MAX_VEHICLE_DOCUMENT_BYTES`, `vehicleDocumentIdempotencyKey`, `validateVehicleDocumentInput`); `vehicle_documents` + `register_vehicle_document`/`remove_vehicle_document` + Storage bucket privado owner-based (`20260909120000`); testes `mobile/tests/vehicle-documents.test.mjs`, `supabase/tests/vehicle_documents_security.sql` | Falha de upload → erro amigável e remoção lógica do registro órfão (sem URL pública vazada; lista falha → erro explícito com retry, nunca lista vazia inventada) | Screenshots da lista de documentos (sem expor conteúdo/URL) |
| 11 | Histórico: aba "Histórico" e "Atendimento atual" na Home | Atendimentos concluídos com `referenceCode` e categoria legível; nenhum atendimento em aberto → "Nenhum atendimento em aberto"/"Ainda não há atendimentos concluídos" | `mobile/src/CustomerHome.tsx` (tabs home/history); leitura RLS de `service_requests` por `created_by` (`mobile/src/supabase.ts` `listServiceRequests`); `lib/customer-service-stage.ts` (projeção do `service_stage` canônico); migrações `20260904022000`, `20260905001000`; testes `mobile/tests/service-request.test.mjs`, `supabase/tests/communication_intake_security.sql` | Falha de leitura → erro explicável com retry (nunca "histórico vazio" por falha; tracking é projeção, não segunda máquina de estado) | Screenshots da aba histórico |
| 12 | "Preciso de ajuda" / `service_request` canônico: criar novo atendimento (veículo, localização manual ou do aparelho, relato, urgência) → revisar → confirmar; depois recuperá-lo | Formulário → "Revisar solicitação" → "Confirmar e solicitar atendimento"; após confirmar, atendimento aparece na lista "Atendimentos" com `referenceCode` (ex.: `VRH-…`), estágio "Solicitado" e veículo; permanece após reabrir o app | `mobile/src/CustomerRequests.tsx` (form + review + submit); `mobile/src/service-request-supabase.ts` (`createMobileServiceRequest`: binding `customer_id`+`created_by`, `reference_code` `VRH-`, insert direto sob RLS de criação de cliente); `mobile/src/service-request.ts` (validação, `PickupLocationSource`, `ServiceUrgency`); `expo-location` (localização em primeiro plano, opcional); migrações `20260904022000_service_request_pickup_location.sql`, `20260905001000_canonical_service_request_customer_identity.sql`; testes `mobile/tests/service-request.test.mjs`, `supabase/tests/communication_intake_security.sql` | Permissão de localização negada → continua com endereço manual;veículo indisponível/sessão expirada → copy amigável e bloqueio antes de criar;(nunca criar atendimento sem binding canônico; nunca relatar sucesso sem registro canônico) | Screenshot da tela de confirmação e da lista com `referenceCode`(desfoque endereço/coordenadas ao compartilhar) |
| 13 | Sign-out/sign-in e expectativa multi-dispositivo | "Sair" no Perfil → volta para autenticação; entrar novamente → jornada restaurada do backend (mesma garagem, veículos, histórico, manutenções, documentos); em outro dispositivo/logado com a mesma conta, mesmos dados canônicos (estado local é somente sessão; dados vivem no Supabase) | `mobile/src/AuthGate.tsx` (sign-out vira `signed-out`); `mobile/src/supabase.ts` (AsyncStorage `persistSession: true`, `autoRefreshToken: true`); `mobile/src/auth-session.ts` (estado); testes `mobile/tests/auth-session.test.mjs` | Sessão expirada/inválida → volta limpa para login e retry sem estado órfão;(nunca estado local paralelo ao backend; nunca dessincronizar garagem entre dispositivos por armazenamento local) | Screenshot do Perfil("Sair") e da home pós-relogin |

## 2. Regressões conhecidas do teste físico — checks explícitos

Cada item é **GO/NO-GO obrigatório**; se falhar, **bloquear o GO** da seção 3 e registrar
a regressão (candidatos de correção já existentes: #233, #243/#244).

| # | Cheque | Resultado esperado (canônico) | Como provocar no dispositivo | Pass = GO | Fail = NO-GO |
| --- | --- | --- | --- | --- | --- |
| R1 | **Nenhuma tarefa standalone de quilometragem restaurada** | A Home mostra a quilometragem como **metadado informativo** ("Quilometragem ainda não informada" ou "<n> km"); **nenhum CTA standalone** "Registrar quilometragem"/"Quilometragem" nas ações da Home/veículo; km é atualizado pelos fluxos canônicos (abastecimento/recarga/manutenção usam o hodômetro) | Navegar Home e aba Veículos e inspecionar ações dos cards | Nenhum CTA standalone de quilometragem; info conforme `customer_vehicles.current_mileage`; `MileageHistoryScreen` **não** wired como rota de jornada | CTA standalone presente → regressão (#233) e **NO-GO** |
| R2 | **Nenhum wording cru de Supabase/schema-cache ao cliente** | Qualquer falha de leitura/gravação exibe **copy amigável e acionável**; **nunca** `PGRST…`, "schema cache", SQL ou detalhe de banco;detalhe técnico fica só em `console.warn` (sem PII/secrets) | Com schema drifted/pre-gate ou rede instável, abrir Home, Energia, Manutenção e Documentos e observar mensagens | Texto amigável e fail-closed em todas as telas | Qualquer texto cru de backend/schema-cache visível → regressão (#243/#244) e **NO-GO** |
| R3 | **Falha de fonte de energia não esconde a fonte disponível** (e vice-versa) | `FuelHistoryScreen` carrega combustível e recarga **independentemente**; se uma fonte falha, a outra continua acessível e o modo correspondente mostra indisponibilidade/erro amigável — sem bloquear a tela inteira | Tornar uma das fontes indisponível (schema drift, rede, permissão) e alternar os modos Combustão/Elétrico | Modo saudável segue utilizável; modo indisponível falha fechado com copy amigável | Uma fonte esconder a outra ou texto cru → regressão (#243/#244) e **NO-GO** |
| R4 | **Nenhum histórico/estado falso quando a fonte canônica está indisponível** | Falha de leitura → estado explícito de erro/indisponibilidade com retry, **distinto** de lista vazia legítima (ex.: `maintenanceByVehicle[id] = null` vs `[]`); nenhum dado fictício, fixture ou linha "zerada" apresentado como real | Com fonte indisponível, abrir as áreas de telemetria/manutenção/histórico e comparar com estado saudável | Erro explícito e acionável; sem contaminação por fixture/demo | Lista falsa/histórico zerado por falha, ou fixture como real → **NO-GO** (regra demo/fixture do repositório) |
| R5 | **Manutenção assistida nunca persiste valores extraídos/sugeridos sem confirmação explícita** | "Usar rascunho assistido" popula **somente campos editáveis** (data placeholder, nota, sem km/valor/datas de foto/OCR); salvar exige o diálogo "Confirmar rascunho assistido?" e a confirmação da cliente; nenhum valor sugerido é gravado automaticamente | Anexar foto/nota do recibo, usar rascunho assistido e tentar salvar sem revisar | Diálogo de confirmação aparece; campos editáveis manualmente; gravação canônica só após confirmação; recibo vira documento privado somente no save confirmado | Valores extraídos/sugeridos persistidos sem confirmação → **NO-GO** (invariante #233) |

## 3. Go/no-go — validação física Alpha 5 (pós-gate de schema não-prod)

O **Human Gate de staging foi concluído** (`#83`; 53 migrations aplicadas e alinhadas
até `20260910000000_vehicle_charging_logs` — runbook `#252`), **logo P3 está atendido**.
Este pack **não executa** nenhuma ação remota: as migrations não são reaplicadas
nem tocadas por este artefato. Os checks abaixo permanecem objetivos e **fail-closed**:
qualquer falha listada bloqueia o GO.

 Além de P1–P4, o GO físico também exige que
as **dependências abertas** da seção 0 estejam resolvidas ou devidamente contidas
(em especial **#244**, alvo de R3/R2/G6 — sem ela, R3/R2/G6 **não podem ser GO**).

| # | Verificação | Critério de GO | Critério de NO-GO (fail-closed) |
| --- | --- | --- | --- |
| G1 | Build instalável abre | Home VERAH renderiza sem texto cru (com P2/P3 atendidos, o preview já deve abrir a jornada real) | Home de build de desenvolvimento/fail-closed (sem env)é esperado **somente** se P2 não estiver atendido; com P1–P3 verdes, tela bloqueada/crash/erro cru = NO-GO |
| G2 | Login/auth e sessão | Entrar com conta piloto (email/senha ou Google); sessão restaura ao reabrir | Falha de auth com texto cru; sessão não restaura; identidade errada |
| G3 | Onboarding + garagem e recuperação | Perfil+termos v1 → veículo manual → garagem; relogin recupera o mesmo veículo do backend | Etapa errada/zetada; veículo perdido; insert direto (sem `confirm_customer_vehicle`) |
| G4 | Multi-veículo e ownership | CTA "+ Adicionar veículo" funciona; substituir/remover com confirmação; outra conta **não** vê os veículos desta (RLS) | Veículo de outra conta visível; remoção apaga histórico; CTA ausente |
| G5 | Home/dashboard e custo/km | Custo total, despesas, distância válida, custo por km; períodos 30/90/Tudo atualizam | Valores inventados; dashboard "zerado" por falha de leitura; texto cru |
| G6 | Combustível + recarga (L vs kWh) | Litros **L** e consumo **km/L**; recarga **kWh** e eficiência **km/kWh**; sem conversão entre unidades; unidades corretas no histórico | kWh exibido como litros (ou inversa; consumo/eficiência fabricados sem intervalo válido) |
| G7 | Manutenção + recibo assistido + confirmação | Rascunho assistido → revisar → confirmação explícita → save canônico + documento privado | Valores extraídos persistidos sem confirmação; save sem confirmação; recibo com URL pública |
| G8 | Lembretes | Reminders por data/km derivados de dados canônicos; aviso de km ausente | Lembretes falsos/inventados; push real (fora do 1.0) |
| G9 | Documentos privados | Upload/remoção com acesso privado, sem URL pública | Vazamento de URL/conteúdo; lista falsa por falha |
| G10 | Histórico | Concluídos com `referenceCode` e estágio legível; projeção do `service_stage` | Histórico zerado por falha; segunda máquina de estado; dado fictício |
| G11 | `service_request` "Preciso de ajuda" — criação e recuperação | Form→revisão→confirmação; atendimento aparece com `referenceCode` e estágio "Solicitado"; persiste no relogin | Criação sem binding canônico (`customer_id`/`created_by`); sucesso falso; atendimento perdido no relogin |
| G12 | Sign-out/sign-in + multi-dispositivo | Sair→login→mesma garagem/histórico/documentos; segundo dispositivo com a mesma conta vê os mesmos dados | Estado dessincronizado ente dispositivos; dados locais paralelos; órfão pós-logout |
| G13 | Regressões R1–R5 | R1–R5 todos passam | Qualquer R falhar = **NO-GO imediato** |
| G14 | Fail-closed e sem texto cru | Nenhuma tela mostra SQL/PGRST/schema-cache/detalhe de ambiente; erros acionáveis | Qualquer ocorrência de texto cru/erro de ambiente = **NO-GO** |

**Decisão:** GO para a validação física do Alpha 5 **somente se** P1–P4 e G1–G14
estiverem todos verdes, o gate humano de schema não-prod (`#83`; **concluído**) estiver
aplicado e as **dependências abertas** da seção 0 estiverem resolvidas ou devidamente
contidas (em especial **#244** para R3/R2/G6). Nenhuma etapa deste pack executa
produção, migração remota, secret, pagamento/mensagem real, App ID/signing/
submissão/publicação ou merge..

## 4. Checklist de readiness executável — repository-safe

| # | Check | Comando (repository-safe; sem banco remoto/secrets) |
| --- | --- | --- |
| 1 | Testes web + checagem estática deste pack | `pnpm test` (inclui `tests/android-smoke-pack-references.test.mjs`) |
| 2 | Typecheck web | `pnpm typecheck` |
| 3 | Lint web | `pnpm lint` |
| 4 | Build web | `pnpm build` |
| 5 | Testes mobile | `cd mobile && pnpm test` |
| 6 | Typecheck mobile | `cd mobile && pnpm typecheck` |
| 7 | Expo Doctor | `cd mobile && pnpm dlx expo-doctor@1` |
| 8 | Banco/autorização local (Docker descartável) | `pnpm ci:database` — replay de migrations + testes SQL; **nenhum banco remoto** |
| 9 | Fonte da verdade do CI | GitHub Actions da PR — `CI / Application`, `CI / Database authorization`, `CI / Mobile workspace` (ver `docs/ci.md`) |

A **fonte da verdade** dos checks executáveis é o CI da PR. Nenhum comando deste pack
aplica migration remota nem toca ambiente alvo.,

**Revalidação deste pack (2026-09-12, após rebase sobre `main` atual `be65bcb`):**
- `node tests/android-smoke-pack-references.test.mjs` — **5/5 pass** (paths, R1–R5,
  contratos canônicos, litros/kWh distintos, cláusulas repository-safe) contra o estado real do `main`.
- `cd mobile && node --experimental-strip-types --test tests/*.test.mjs` — **80/80 pass** (mesma suíte
  reportada na abertura do PR, agora re-executada no tree pós-rebase).
- CI da PR continua a fonte da verdade final (`CI / Application`, `CI / Database authorization`,
  `CI / Mobile workspace`).

## Referências verificáveis (check automatizado)

- `mobile/eas.json`
- `mobile/App.tsx`
- `mobile/src/config.ts`
- `mobile/src/AuthScreen.tsx`
- `mobile/src/auth-session.ts`
- `mobile/src/supabase.ts`
- `mobile/src/CustomerJourney.tsx`
- `mobile/src/customer-journey.ts`
- `mobile/src/CustomerHome.tsx`
- `mobile/src/FuelHistoryScreen.tsx`
- `mobile/src/MaintenanceScreen.tsx`
- `mobile/src/maintenance-assist.ts`
- `mobile/src/maintenance.ts`
- `mobile/src/VehicleDocumentsScreen.tsx`
- `mobile/src/vehicle-documents.ts`
- `mobile/src/CustomerRequests.tsx`
- `mobile/src/service-request-supabase.ts`
- `mobile/src/service-request.ts`
- `mobile/src/MileageHistoryScreen.tsx`
- `mobile/src/VehicleOnboardingStep.tsx`
- `lib/customer-service-stage.ts`
- `supabase/migrations/20260712210000_create_user_profiles.sql`
- `supabase/migrations/20260730150101_customer_identity_foundation.sql`
- `supabase/migrations/20260730153004_secure_customer_identity.sql`
- `supabase/migrations/20260716000000_create_customer_vehicles.sql`
- `supabase/migrations/20260827013000_identity_onboarding_foundation.sql`
- `supabase/migrations/20260827040000_vehicle_onboarding.sql`
- `supabase/migrations/20260904022000_service_request_pickup_location.sql`
- `supabase/migrations/20260905001000_canonical_service_request_customer_identity.sql`
- `supabase/migrations/20260907000000_vehicle_mileage_logs.sql`
- `supabase/migrations/20260907120000_vehicle_fuel_logs.sql`
- `supabase/migrations/20260907141500_vehicle_replacement_preserving_history.sql`
- `supabase/migrations/20260908000000_vehicle_expenses_dashboard.sql`
- `supabase/migrations/20260909005541_vehicle_maintenance_records.sql`
- `supabase/migrations/20260909120000_vehicle_documents.sql`
- `supabase/migrations/20260910000000_vehicle_charging_logs.sql`
- `supabase/tests/customer_identity_security.sql`
- `supabase/tests/identity_onboarding_security.sql`
- `supabase/tests/vehicle_onboarding_security.sql`
- `supabase/tests/vehicle_replacement_security.sql`
- `supabase/tests/vehicle_fuel_logs_security.sql`
- `supabase/tests/vehicle_charging_logs_security.sql`
- `supabase/tests/vehicle_expenses_security.sql`
- `supabase/tests/vehicle_maintenance_security.sql`
- `supabase/tests/vehicle_documents_security.sql`
- `supabase/tests/communication_intake_security.sql`
- `mobile/tests/auth-session.test.mjs`
- `mobile/tests/customer-journey.test.mjs`
- `mobile/tests/vehicle-catalog.test.mjs`
- `mobile/tests/vehicle-replacement.test.mjs`
- `mobile/tests/fuel-log.test.mjs`
- `mobile/tests/charging-log.test.mjs`
- `mobile/tests/energy-history.test.mjs`
- `mobile/tests/maintenance.test.mjs`
- `mobile/tests/maintenance-assist.test.mjs`
- `mobile/tests/vehicle-documents.test.mjs`
- `mobile/tests/service-request.test.mjs`
- `docs/ship-verah/release-1.0-build-readiness-checklist.md`
- `docs/runbooks/supabase-production-reconciliation.md`
- `docs/runbooks/supabase-reconciliation-manifest.md`
- `docs/ci.md`