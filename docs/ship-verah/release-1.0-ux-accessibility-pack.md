# Release 1.0 — Customer-facing UX copy/accessibility/readability QA pack (repository-safe)

Data: 2026-09-11 (pack), 2026-09-12 (rebase sobre `main` `da1d5d0`, pós-merge #244/#246/#248 e do mapa #250). Base: `main` em `d391782` (`#232/#234`), rebases limpos sobre `c71ec30` e sobre `da1d5d0`. Refs: #164, #228/#229, #233/#234, #250 (merged). PRs Draft abertas revalidados via GitHub API em 2026-09-12 após o merge de #250: **#151/#255/#258** (+ este pack #254); #236/#239/#240/#242/#244/#246/#248/#250 já **merged** — **nenhum arquivo tocado por Draft aberta é alterado aqui** (ver `tests/release-1.0-ux-accessibility-copy-references.test.mjs` para o snapshot atualizado dos file sets). Escopo: **auditoria de copy/legibilidade/acessibilidade customer-facing somente**, com correções **bounded** de strings em arquivos **não-owners**, sem nenhuma ação externa.



## 0. Escopo, pré-condições e invariantes

Este pack é **documentação e validação estática somente** (com pequenas correções de copy em arquivos sem Draft PR dona). Ele **não executa nenhuma ação externa**: nenhum banco remoto, push/repair/reconciliation/aplicação de migration, secret, conta/credential, criação/registro de App ID/bundle, signing/provisioning, submissão/TestFlight/App Store, publicação ou merge — **nenhum merge** foi executado por este pack. A aplicação das migrations não-prod usadas por qualquer build continua sendo um **Human Gate separado** (`#83`; ver `docs/runbooks/supabase-production-reconciliation.md`) e **não é executada por este artefato**.

**Invariantes preservados:** Supabase canônico como única fonte da verdade, identidade `user_profiles`/`verah_identities`/`customers` canônica ( auth provider é método de login, não identidade), com campos rastreáveis como `customer_id` e `created_by`, `customer_id`/veículo ownership/`service_request`, quilometragem, combustível/recarga (litros e kWh **distintos**, sem conversão inventada), despesas, manutenções, documentos, RLS/auth e fail-closed (nenhuma fonte indisponível vira dado fictício; nenhum erro cru de backend aparece ao cliente). Nenhuma correção toca arquivos donos das Draft PRs listadas. As únicas fontes tocadas são de copy customer-facing e sem dono:



| Arquivo | Correção aplicada | Evidência no teste estático |
| --- | --- | --- |
| `mobile/App.tsx` ( FailClosedNotice) | remove exposição crua de `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` e do termo "Supabase"; copy agora diz "VERAH ainda não está conectada neste ambiente…" | `tests/release-1.0-ux-accessibility-copy-references.test.mjs` |
| `mobile/src/service-request-supabase.ts` | fallback sem cliente: "Supabase não configurado nesta build." → "A conexão com a VERAH não está configurada neste build." ( mesmo padrão de `mobile/src/fipe-catalog.ts`) | idem |
| `mobile/src/fipe-catalog.ts` | "…configurado no backend da VERAH." → "…configurado na VERAH." ( remove "backend") | idem |
| `mobile/src/vehicle-documents.ts` | "Chave de idempotência inválida." → "Houve um erro ao preparar o arquivo. Tente novamente." ( jargão técnico removido; teste `mobile/tests/vehicle-documents.test.mjs` atualizado) | idem + teste mobile |

##  ​​1. Princípios de copy de erro customer-safe

A partir da auditoria das strings de fallback/erro exportas ao cliente (`mobile/src/*.tsx`, `mobile/src/*.ts`, `mobile/App.tsx`), os princípios abaixo são a política deste pack:

| # | Princípio | E exemplos aprovados (fonte repo) |
| --- | --- | --- |
| E1 | **Nunca citar nome do backend/Supabase/PostgREST/schema/RLS/RPC/table/function/cache/env-var** em copy customer-facing | "A conexão com a VERAH não está configurada neste build." (`mobile/src/service-request-supabase.ts`, `mobile/src/fipe-catalog.ts`); "VERAH ainda não está conectada neste ambiente." (`mobile/App.tsx`) |
| E2 | **Fallback sem jargão técnico/de domínio interno**; se a causa é interna, dizer ação do cliente | "Tente novamente em instantes." (`mobile/src/fipe-catalog.ts`); "Reabra a área para tentar novamente." (`mobile/src/CustomerHome.tsx`); "Tente novamente com os mesmos dados." (`mobile/src/customer-journey.ts`); "Houve um erro ao preparar o arquivo. Tente novamente." (`mobile/src/vehicle-documents.ts`) |
| E3 | **Nunca inventar falha nem estado fictício** — descrever somente o que o contrato canônico permite | "Sem intervalo válido para calcular consumo." / "Sem intervalo válido para calcular eficiência." (`mobile/src/FuelHistoryScreen.tsx`); "Nenhum abastecimento registrado neste veículo."; "Ainda não há atendimentos concluídos." (`mobile/src/CustomerHome.tsx`) |
| E4 | **Fail-closed com ação**: erro sem fonte → retry/refazer explícito, nunca dado sintético | "Tentar novamente" (`CustomerJourney.tsx`), "Tentar carregar FIPE novamente" (`VehicleOnboardingStep.tsx`), "Compartilhe novamente a localização atual ou use o endereço manual." (`CustomerRequests.tsx`) |
| E5 | **Confirmação explícita para ações destrutivas/irreversíveis** | "Remover veículo?" + "O histórico de atendimentos será preservado." (`CustomerHome.tsx` `confirmRemoval`); rascunho assistido → "Confirmar rascunho assistido?" + "Nenhum campo foi extraído automaticamente do recibo…" (`MaintenanceScreen.tsx`); revisão de solicitação → "Revisar solicitação" / "Confirme antes de enviar" (`CustomerRequests.tsx`) |
| E6 | **Unidades separadas sem conversão inventada** | "litros nunca viram kWh" (`FuelHistoryScreen.tsx`); "Combustão … Litros abastecidos" / "Elétrico … Energia da recarga (kWh)" (idem) |
| E7 | **Permissões de localização com caminho alternativo fail-closed** | "A localização não foi autorizada. Sem problema: informe o endereço manualmente abaixo."; "O atendimento continua funcionando se você negar." (`CustomerRequests.tsx`) |
| E8 | **Contratos canônicos preservados** (nomes citados só em docs/auditoria, nunca em copy customer-facing) | `customer_id`, `created_by`, `confirm_customer_vehicle`, `replace_customer_vehicle`, `register_vehicle_mileage`, `register_vehicle_fuel`, `register_vehicle_charging`, `register_vehicle_maintenance`, `vehicle_expense_summary`, `createMobileServiceRequest`, `service_request`, RLS/auth |

##  ​​2. Checklist de acessibilidade/legibilidade (Release 1.0)

Estado: **auditoria estática repository-safe** (onde verificável no código); itens que exigem **dispositivo físico / leitor de tela / contraste real** estão marcados **[FÍSICO]** e **não** são reivindicados como concluídos por este pack.



| Área | Critério | Evidência / estado no código | Tipo |
| --- | --- | --- | --- |
| Labels | Todo campo editável tem label/placeholder legível e, onde necessário, `accessibilityLabel` | `MaintenanceScreen.tsx` ( accessibilityLabel em nota/switch); demais inputs usam placeholder/TextInput sem `accessibilityLabel` explícito em vários pontos (`AuthScreen`, `VehicleOnboardingStep`, `FuelHistoryScreen`, `MileageHistoryScreen`, `VehicleDocumentsScreen`, `CustomerRequests`) | Follow-up |
| Touch targets | Área tocável com altura/padding adequado (≥44pt ideal) | Botões primários/outline têm `paddingVertical: 12–14` (=44pt quote aproximado); chips/pills têm `paddingVertical: 8–10` (`FuelHistoryScreen`, `VehicleOnboardingStep`, `CustomerRequests`) — **verificação precisa de medida física é [FÍSICO]** | Pass + [FÍSICO] |
| Form semantics | `accessibilityRole`/`accessibilityState` em controles custom | checkbox custom com `accessibilityRole="checkbox"` + `accessibilityState={{checked}}` (`CustomerJourney.tsx`, `VehicleOnboardingStep.tsx`); tab buttons `accessibilityRole="tab"` + `accessibilityState={{selected}}` (`CustomerHome.tsx`); `Switch` irmão com `accessibilityLabel` (`MaintenanceScreen.tsx`); `Text` de erro com `accessibilityRole="alert"` (`MaintenanceScreen.tsx`); **demais erros são `<Text>` sem role alert** (`AuthScreen`, `VehicleOnboardingStep`, `FuelHistoryScreen`, `MileageHistoryScreen`, `VehicleDocumentsScreen`, `CustomerRequests`) | Follow-up |
| Destructive/confirm | Ação destrutiva exige confirmação explícita com cancelar | "Remover" veículo → `Alert` "Cancelar"/"Remover" (`CustomerHome.tsx`); "Remover" documento → **sem confirmação** (`VehicleDocumentsScreen.tsx` `remove()` chama RPC direto) | Follow-up ( documento) |
| Loading | Estado de carregamento com texto não enganoso | "Restaurando sessão…", "Restaurando sua jornada…", "Carregando histórico…", "Carregando catálogo FIPE…", "Carregando…" ( por tela; sem skeleton/spinner de duração; **[FÍSICO]** para percepção real) | Pass + [FÍSICO] |
| Empty | Estados vazios claros e acionáveis | "Nenhum veículo ativo encontrado." + "Adicionar veículo"; "Nenhum atendimento em aberto" + "Solicitar atendimento"; "Ainda não há abastecimentos registrados." / "Ainda não há recargas registradas."; "Sua garagem está vazia."; "Ainda não há documentos deste veículo." | Pass |
| Error | Erro customer-safe, sem backend cru; com retry/refazer quando possível | Correções deste pack ( seção 0) removem termos crus; princípio E1–E4 ( seção 1); **erros dinâmicos de RPC/storage continuam sendo passados crus em alguns caminhos** ( ver follow-ups F1–F4, seção 4) | Follow-up |
| Contraste | Contraste estático verificável ( branco sobre `#177F78`, preto sobre `#ECF8F6`, branco sobre `#2AA79B`, etc.) | Paleta única, consistente entre telas; **[FÍSICO]** para aferição real em telas/alto-brilho e verificação AA/AAA com ferramenta | Pass + [FÍSICO] |
| Fontes/tamanhos | Hierarquia consistente ( títulos 20–28, corpo  ​13–15, notas  ​11–13); `lineHeight` presente nos blocos de corpo | Verificado por auditoria de estilos(ex.: `CustomerHome`, `FuelHistoryScreen`, `CustomerRequests`); `maxFontSizeMultiplier` **não usado** em nenhum `Text` — dinâmico de fonte do sistema pode quebrar layouts | Follow-up |
| Keyboard/screen-reader | Navegação por teclado/foco/ordem de leitura | React Native move a navegação para o sistema ([FÍSICO]): **não verificável em CI**; nenhum teste de acessibilidade automatizado presente | [FÍSICO] + Follow-up |
| SafeArea/notch | Conteúdo dentro de safe areas | `App.tsx` usa `SafeAreaView`; telas internas usam `ScrollView`; **[FÍSICO]** para validação em dispositivo | Pass + [FÍSICO] |
| Deep link/auth | Fluxo OAuth retorna ao app sem expor URL/scheme interna ao cliente | `mobile/src/supabase.ts` `handleAuthUrl` valida prefixo `verah-dev://auth/callback` e troca código por sessão; falhas → strings customer-safe ("Não foi possível abrir o login do Google.", "Retorno do Google sem sessão válida.") | Pass |
| Texto longo/truncamento | Cabeçalhos/nomes longos não quebram layout | `numberOfLines={2}` em chips FIPE (`VehicleOnboardingStep.tsx`); `flexShrink` em vários textos; **[FÍSICO]** para nomes longos reais | Pass + [FÍSICO] |

##  ​​3. Matriz por tela — fluxos Release 1.0 (_pass / risk / follow-up_)

Legenda: **PASS** = aprovado por evidência repo (strings/estilos/contratos); **RISCO** = ponto de atenção com base estática (não reivindicado como falha real); **FOLLOW-UP** = correção repo-safe futura (código com dono de Draft PR, ou mudança de produto); **FÍSICO** = exige dispositivo físico.



###​​ 3.1 Auth/onboarding/garagem

| Tela | Copy customer-safe | Acessibilidade/legibilidade | Verdict |
| --- | --- | --- | --- |
| `mobile/src/AuthScreen.tsx` | PASS — sem termos backend; erros vêm do `error.message` do facade (auth) — ver F1 | Placeholders/labels sem `accessibilityLabel` explícito em inputs; erro sem `role="alert"` | Pass + F1/F6 |
| `mobile/src/AuthGate.tsx` | PASS — "Restaurando sessão…" | spinner nativo com cor; texto curto | Pass |
| `mobile/src/CustomerJourney.tsx` ( perfil básico) | PASS — "Seu progresso fica salvo e acompanha você em qualquer dispositivo."; erro de aceite claro; termos citam "onboarding do Pilot Alpha v1" ( faz parte do contrato de termos — mantido) | `Pressable` checkbox com role/state; erros sem `role="alert"` | Pass + F6 |
| `mobile/src/VehicleOnboardingStep.tsx` | PASS — copy FIPE legível ("O catálogo usa a tabela FIPE real. A consulta gratuita não faz identificação automática pela placa."); erros claros( sem termos internos) | Chips com `numberOfLines`; erro sem `role="alert"`; `accessibilityLabel` ausente em inputs | Pass + F6 |
| `mobile/src/CustomerHome.tsx` ( garagem/dashboard) | PASS — "Olá, {nome}. Como podemos ajudar hoje?"; "Quanto meu carro me custa?"; copy empty/destructive aprovado | Tab bar com roles; Alert destrutivo com cancelar; **fallback cru de `serviceStage` desconhecido** (`stageLabels[stage] ?? stage`) — ver F2 | Pass + F2 |

###​​ 3.2 Home/dashboard

| Área | Evidência | Verdict |
| --- | --- | --- |
| Saudação + CTA "Solicitar atendimento" | `CustomerHome.tsx` hero | Pass |
| "Quanto meu carro me custa?" (`ExpensesDashboard`) | total em R$, despesa(s), km válido, células Combustível/Manutenção/Outros/Custo por km | Pass |
| Vazio: sem vehicle/sem atendimentos | copy empty claro + ação | Pass |
| Lembretes de manutenção ("Vencidas / vencem hoje", "Próximas") | derivação `deriveMaintenanceReminders` pura; "Registre a quilometragem para avaliar os lembretes por km." | Pass |
| Histórico | "Ainda não há atendimentos concluídos." etc. | Pass |

###​​ 3.3 Fuel/energy

| Área | Evidência | Verdict |
| --- | --- | --- |
| Unidades L × kWh **distintas** | `mobile/src/FuelHistoryScreen.tsx`: "Registre cada abastecimento ( litros) ou recarga ( kWh)… litros nunca viram kWh."; `customer-journey.ts` `mergeEnergyHistory` preserva `unit`; teste `mobile/tests/energy-history.test.mjs` | Pass (**invariante preservado**) |
| Consumo/eficiência | "Consumo … km/L" / "Eficiência … km/kWh"; "Sem intervalo válido para calcular consumo/eficiência." | Pass |
| Formulário | labels/placeholders claros; erro customer-safe; `FuelHistoryScreen.tsx` era dono da Draft PR #244 (merged em 2026-09-12) — **nenhuma alteração aplicada aqui por escopo copy-only** | Pass ( auditado; sem edição por escopo) |
| Vazio/loading | "Nenhum abastecimento registrado neste veículo."/"Ainda não há recargas registradas."/"Carregando histórico…" | Pass |

###​​ 3.4 Despesas/custo por km

| Área | Evidência | Verdict |
| --- | --- | --- |
| `vehicle_expense_summary` RPC → dashboard | total/count/`distance_km`/`cost_per_km_cents`; fallback "sem km válido" / "—" para custo | Pass |
| Períodos 30/90/Tudo | chips `30 dias`/`90 dias`/`Tudo` | Pass |

###  ​​3.5 Maintenance

| Área | Evidência | Verdict |
| --- | --- | --- |
| Formulário com nota/foto do recibo | "A VERAH não extrai campos da foto: data, hodômetro, valor e próximos vencimentos são preenchidos manualmente e exigem sua confirmação antes do salvamento." | Pass (**invariante draft-only preservado**) |
| Rascunho assistido **nunca auto-persiste** | `mobile/src/maintenance-assist.ts` (`shouldConfirmAssistedSave`; `buildMaintenanceAssistedDraft` deixa km/valor/datas em branco); `MaintenanceScreen.tsx` `save()` exige `Alert` "Confirmar e salvar" quando `activeDraft` existe; teste `mobile/tests/maintenance-assist.test.mjs` | Pass (**invariante draft-only preservado**) |
| Incluir nas despesas | Switch + copy "O registro salvo não pode ser editado." | Pass |

###​​ 3.6 Reminders

| Área | Evidência | Verdict |
| --- | --- | --- |
| Derivação local por data/km | `mobile/src/maintenance.ts` `deriveMaintenanceReminders` ( thresholds inclusivos; sem push — push fora do 1.0, ver `audit-release-1.0.md`) | Pass |
| Copy de estados | "Vencidas / vencem hoje", "Próximas", "Nenhuma", "Registre a quilometragem…" | Pass |

###​​ 3.7 Documents/history

| Área | Evidência | Verdict |
| --- | --- | --- |
| Upload privado | "Com acesso privado e histórico seguro. Nada fica acessível por URL pública."; "O arquivo foi enviado com acesso privado, sem URL pública." | Pass (**sem URL pública** — copy não expõe `storage_bucket`/`storage_path`) |
| Limites | "PDF, JPEG, PNG e WebP até 10 MiB."; "O arquivo excede o limite de 10 MiB." | Pass |
| Remover documento | **sem confirmação** — `remove()` direto (`VehicleDocumentsScreen.tsx`) | Follow-up F3 |
| Histórico de atendimentos | abas `Histórico`/"Ver histórico completo"; copy vazio claro | Pass |

###​​ 3.8 "Preciso de ajuda" (`CustomerRequests.tsx`)

| Área | Evidência | Verdict |
| --- | --- | --- |
| Formulário passo-a-passo | "Vamos entender o que aconteceu"; "Informe onde o veículo está."; validations em PT claro | Pass |
| Localização/privacy | "A VERAH solicita apenas acesso em primeiro plano quando você toca na opção acima. O atendimento continua funcionando se você negar."; "Esta localização será usada pela VERAH e pelo Concierge somente…" | Pass |
| Revisão/confirmação | "Confirme antes de enviar"; "Voltar e editar" | Pass (**explícita antes do save canônico**) |
| Estado de estágio | `stageLabels` + fallback cru `?? serviceStage` ( mesmo padrão da home) | Follow-up F2 |

###​​ 3.9 Fail-closed global

| Área | Evidência | Verdict |
| --- | --- | --- |
| App sem config | `mobile/App.tsx` agora renderiza copy customer-safe ( correção deste pack) | Pass |
| Telas com facade/serviço indisponível | "Manutenções indisponíveis.", "Documentos indisponíveis.", "A conexão com a VERAH não está configurada neste build." | Pass + F4 |
| Erros RPC/storage crus | continuam passados ao cliente em diversos caminhos (`auth-session.ts`, `customer-journey.ts`, `service-request-supabase.ts`, `supabase.ts` upload) — **não alterados aqui** ( ver F1/F4/F5) | Follow-up |

##  ​​4. Follow-ups repo-safe (não aplicados por colisão/escopo)

Estes são candidatos a issues futuras**sem tocar arquivos donos das Draft PRs abertas** revalidados após o merge de #250 (#151/#255/#258 + este pack #254). Nenhum deles é executado por este pack.



| # | Follow-up | Arquivos | Motivo ( colisão/escopo) |
| --- | --- | --- | --- |
| F1 | Sanitizar/mapear erros dinâmicos de auth/Supabase em mensagens customer-safe( ex.: "Invalid login credentials" → "E-mail ou senha incorretos.") em `auth-session.ts`/`supabase.ts` | `mobile/src/auth-session.ts`, `mobile/src/supabase.ts` ( sem dono, mas mudança de comportamento ampla; fora do escopo copy-only) | Escopo: este pack é copy/QA estático; mudança comportamental merece issue própria com testes dedicados |
| F2 | Fallback para `serviceStage` desconhecido em copy customer-facing ("Em andamento" em vez de exibir o estágio cru) | `mobile/src/CustomerHome.tsx`, `mobile/src/CustomerRequests.tsx` ( donas da Draft PR #255; é decisão de produto de copy) | Escopo/decisão de produto; duas telas ( projeção de estado canônico) |
| F3 | Confirmação destrutiva antes de "Remover" documento | `mobile/src/VehicleDocumentsScreen.tsx` ( dona da Draft PR #255; UX behavior change) | Escopo: exigiria decisão de produto ( irreversível?) + teste dedicado |
| F4 | Mapear erros de upload/storage (`supabase.ts` `registerVehicleDocumentSafely`) para copy customer-safe( hoje `error.message` cru chega ao cliente em falhas não-409) | `mobile/src/vehicle-documents.ts` ( teste atual espera "already exists"/"quota"; mudança de contrato de mensagem exigiria atualizar testes — mudança comportamental) | Escopo |
| F5 | Adicionar `maxFontSizeMultiplier` / verificar layout com fonte dinâmica | `mobile/src/*.tsx` ( cross-cutting; 9 telas são donas da Draft PR #255 `design-system-v1` — `AuthGate`, `AuthScreen`, `CustomerHome`, `CustomerJourney`, `CustomerRequests`, `MaintenanceScreen`, `MileageHistoryScreen`, `VehicleDocumentsScreen`, `VehicleOnboardingStep` — + validação física) | Escopo + colisão + [FÍSICO] |
| F6 | Adicionar `accessibilityRole="alert"` aos erros e `accessibilityLabel` aos inputs em todas as telas | `mobile/src/*.tsx` ( cross-cutting; mesmas 9 telas donas de #255) | Escopo + colisão parcial |

##​​ 5. Stática checks deste pack (repository-only)

| Check | Comando | Resultado esperado |
| --- | --- | --- |
| Teste estático de copy/contratos/unidades/draft-only | `node --experimental-strip-types --test tests/release-1.0-ux-accessibility-copy-references.test.mjs` | pass ( ver seção 6) |
| Suíte completa | `pnpm test && pnpm typecheck && pnpm lint && pnpm build` e `cd mobile && pnpm test && pnpm typecheck && pnpm dlx expo-doctor@1` e `pnpm ci:database` | **fonte da verdade: CI da PR** |

##  ​6. Evidência pós-gate( smoke FÍSICO —a capturar, não executada)

A captura abaixo é o **conjunto mínimo sem PII/secrets** a coletar após a existência de um build instalável( pós Human Gates do `release-1.0-build-readiness-checklist.md` e `release-1.0-ios-readiness.md`). **Nenhum item é reivindicado como concluído por este pack repository-safe** — todos ficam marcados **[FÍSICO]** até captura real.



| # | Evidência a capturar | Como | PII? |
| --- | --- | --- | --- |
| S1 | Screenshot de cada tela do fluxo 1.0( auth → onboarding → garagem → km → energia → despesas → manutenção → lembretes → documentos → dashboard → Preciso de ajuda) em iOS e Android | Simulator/dispositivos não-prod; sem contas reais; usar dados fictícios determinísticos( nunca produção); desfocar/ocultar qualquer e-mail pessoal | **Sem PII** — fixture apenas |
| S2 | Fluxo de erro real: rede off / RPC off enquanto registra km/abastecimento/recarga/manutenção/documento/solicitação | capturar o texto exibido ao cliente | Sem PII |
| S3 | Fluxo de permissão de localização negada( tela "Preciso de ajuda") | capturar o texto do caminho manual alternativo | Sem PII |
| S4 | Leitores de tela( VoiceOver iOS/TalkBack Android): ordem de leitura das telas principais, labels dos inputs, anúncio de erros | gravação curta( ≤2min); sem áudio pessoal | Sem PII |
| S5 | Contraste em brilho máximo / modo claro(app é light-only: `userInterfaceStyle: "light"`) | fotos lado-a-lado das telas principais; registrar qualquer falha percebida | Sem PII |
| S6 | Touch targets: medir áreas tocáveis com régua/ferramenta de desenvolvimento em dispositivo real | registrar dimensões de chips/buttons nas telas densas( energia, solicitação) | Sem PII |
| S7 | Teclado/scroll: formulários longos com teclado numérico/decimal( kV/h, litros, R$) não escondem inputs | capturar estado com teclado aberto( iOS/Android) | Sem PII |
| S8 | Deep link OAuth: retorno de `verah-dev://auth/callback` reabre o app com sessão | Simulator `xcrun simctl openurl` com code de teste não-prod; capturar tela pós-login | Sem PII |

##​ 7. Conclusão

O estoque atual da `main` `da1d5d0` (+ os 4 copy-fixes bounded deste pack, todos em arquivos sem dono) já apresenta copy customer-safe, unidades L/kWh separadas, draft assistido de manutenção **draft-only até confirmação explícita**, fluxo "Preciso de ajuda" com revisão/privacy e estados vazios/erro em **PT-BR claro**, sem termos Supabase/PostgREST/schema/RLS/RPC/tabela/função/cache/env-var. Os itens restantes são **follow-ups repo-safe** (seção 4) e **validação física** (seção 6), esta última exigindo os Human Gates de build/distribuição (#228/#229/#248) — nenhum dos quais é executado por este pack. **Nenhum merge foi executado.**
