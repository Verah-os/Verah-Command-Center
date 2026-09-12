# Release 1.0 — iOS build readiness e simulator/preflight pack (repository-safe)

Data: 2026-09-12. Base: `main` em `bd90691` (`#246`, pós-merge de
#236/#239/#240/#242/#244/#252). Refs: #164, #228/#229, #233, #239, #244,
#246. Rebaseado sobre o `main` atual (commit `bd90691`), sem conflito. PRs
Draft abertas **#250/#254/#255/#258** (#248 é esta própria branch; #151/#145
também abertas) — **nenhum arquivo tocado por elas é alterado aqui**
(verificado por diff contra cada head). Escopo: preflight/repository-readiness
**somente** — nenhuma ação externa Apple é executada.

## 0. Escopo, pré-condições e invariantes

Este pack é **documentação e validação estática somente**. Ele **não executa nenhuma ação
externa**: nenhum banco remoto, push/repair/reconciliation/aplicação de migration,
secret, conta/credential Apple, criação/registro de App ID/bundle, signing/
provisioning, submissão/TestFlight/App Store, publicação ou merge. A aplicação das
migrations não-prod usadas por qualquer build continua sendo um **Human Gate separado**
(`#83`; ver `docs/runbooks/supabase-production-reconciliation.md` +
`supabase-reconciliation-manifest.md`) e **não é executada por este artefato**.

**Pré-condições para o caminho **Simulator** (todas Human Gates prévios):**

| # | Pré-condição | Evidência/referência |
| --- | --- | --- |
| P1 | Build `.app` para Simulator gerado (EAS, conta humana Expo/EAS) | `docs/ship-verah/release-1.0-build-readiness-checklist.md`; `mobile/eas.json` (profile `preview-simulator`, `ios.simulator: true`) |
| P2 | Variáveis públicas EAS `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` apontando ao projeto **não-prod** | `mobile/.env.example`; `mobile/src/config.ts` (fail-closed; nunca service role) |
| P3 | Migrations não-prod revisadas **aplicadas por humano** no Supabase usado pelo preview | Human Gate `#83`; `supabase/migrations/` |
| P4 | macOS + Xcode + iOS Simulator (Apple hardware/software; conta Apple opcional para Simulator) | — |

**Invariantes preservados:** Supabase canônico como única fonte da verdade, identidade
`user_profiles`/`verah_identities`/`customers` canônica (auth provider é método
de login, não identidade), `customer_id`/veículo ownership/`service_request`,
quilometragem, combustível/recarga (litros e kWh **distintos**, sem conversão
inventada), despesas, manutenções, documentos, RLS/auth e fail-closed (nenhuma
fonte indisponível vira dado fictício; nenhum erro cru de backend aparece ao cliente).

## 1. Auditoria da configuração iOS/Expo/EAS já versionada

Sem criar/registrar nenhum identificador externo, o estoque versionado é:

| Item | Valor versionado | Arquivo | Observação |
| --- | --- | --- | --- |
| Nome | `VERAH Dev` | `mobile/app.json` | branding explícito de desenvolvimento; muda para produção = Human Gate |
| Slug | `verah` | `mobile/app.json` | identificador de projeto Expo (não App ID) |
| Scheme (deep link) | `verah-dev` | `mobile/app.json` (`expo.scheme`) | usado em `mobile/src/supabase.ts` (`redirectTo` e `handleAuthUrl` prefix); scheme de dev, não de loja |
| Bundle ID iOS | `com.verah.app.dev` | `mobile/app.json` (`expo.ios.bundleIdentifier`) | **dev-only**; registro de bundle de produção = Human Gate |
| Package Android | `com.verah.app.dev` | `mobile/app.json` (`expo.android.package`) | espelho dev; package de produção = Human Gate |
| Tablet | `supportsTablet: false` | `mobile/app.json` (`expo.ios`) | release atual é iPhone-first; habilitar iPad = decisão futura |
| Build profiles | `preview` / `preview-simulator` / `store-preview` / `production` | `mobile/eas.json` | `preview-simulator` herda `preview` e força `ios.simulator: true` |
| `ios.simulator` | `false` em `preview`/`store-preview`/`production`; `true` em `preview-simulator` | `mobile/eas.json` | build **Simulator** usa `preview-simulator` e **não exige assinatura/Apple Developer** |
| Project ID EAS | `f971ac09-dad3-4ba5-8274-c8cbb1091cec` | `mobile/app.json` (`extra.eas.projectId`) | id de projeto EAS (conta Expo/EAS já vinculada pelo fundador; não é App ID Apple) |
| Plugin iOS | `expo-location` com permissão em português | `mobile/app.json` (`expo.plugins`) | utilizada pelo fluxo `service_request` (pickup local em primeiro plano, opcional) |

**Sem rotas iOS-only:** o código mobile é compartilhado entre iOS/Android (`mobile/src/`,
`mobile/App.tsx`); o único uso de `Platform.OS` é cosmético
(`KeyboardAvoidingView` `behavior: Platform.OS === "ios" ? "padding" : undefined`,
em `mobile/src/AuthScreen.tsx`). **Nenhum caminho iOS-only** contorna identidade,
`customer_id`, ownership de veículo, `service_request`, quilometragem,
combustível/recarga (L/kWh), despesas, manutenções, documentos ou RLS/auth.

Deep link: `verah-dev://auth/callback` é tratado por código compartilhado
(`mobile/src/AuthGate.tsx` `Linking.addEventListener`/`getInitialURL`;
`mobile/src/supabase.ts` `handleAuthUrl`). Google OAuth usa `skipBrowserRedirect: true`
e `Linking.openURL`, retornando ao scheme; o contrato de sessão é o mesmo em
ambas as plataformas (`auth-session.ts`, `supabase.ts` `persistSession: true`).

## 2. Validação determinística repository-safe (pré-flight estático)

Nenhum comando abaixo exige secret, conta Apple ou assinatura. Todos são
executáveis em CI/sandbox e são a validação automatizada deste pack.

| # | Check | Comando | Resultado esperado |
| --- | --- | --- | --- |
| 1 | Testes web + checagem estática deste pack | `pnpm test` (inclui `tests/ios-readiness-references.test.mjs`) | pass |
| 2 | Typecheck web | `pnpm typecheck` | ok |
| 3 | Lint web | `pnpm lint` | ok |
| 4 | Build web | `pnpm build` | ok |
| 5 | Testes mobile (auth/jornada/veículos/km/energia/manutenção/documentos/service-request) | `cd mobile && pnpm test` | pass |
| 6 | Typecheck mobile | `cd mobile && pnpm typecheck` | ok |
| 7 | Expo Doctor (config/plugin/versõesco) | `cd mobile && pnpm dlx expo-doctor@1` | 20/20 (ou equivalente suportado) |
| 8 | Banco/autorização local (Docker descartável; **nenhum banco remoto**) | `pnpm ci:database` | success |
| 9 | Fonte da verdade do CI | GitHub Actions da PR — `CI / Application`, `CI / Database authorization`, `CI / Mobile workspace` (ver `docs/ci.md`) | success |

A **fonte da verdade** dos checks executáveis é o CI da PR. Nenhum comando
deste pack aplica migration remota nem toca ambiente alvo.,

## 3. Caminho de validação local / Simulator (sem assinatura)

O perfil EAS `preview-simulator` (herda `preview`, mascara `ios.simulator: true`)
produz um `.app` para **iOS Simulator sem exigir Apple Developer/signing** — é o
caminho suportado pelo projeto atual para validação iOS pré-gate. Passos
(pós-gates P1–P4):

```bash
cd mobile
pnpm dlx eas-cli@latest build --profile preview-simulator --platform ios
```

Instalação no Simulator:

```bash
xcrun simctl install booted <caminho-do-.app>
xcrun simctl launch booted <bundle-id>   # ex.: com.verah.app.dev
```

Ou abra o Simulator e arraste o `.app`/`.tar.gz` para a lista de apps. Para
fazer o deep link de retorno do Google OAuth manualmente no Simulator:

```bash
xcrun simctl openurl booted "verah-dev://auth/callback?code=<code>"
```

(Na prática o fluxo OAuth completo abre o navegador do Simulator e retorna via
`Linking` automaticamente; o comando acima serve para validar o handler de
retorno com um code de teste em ambiente não-prod.)

Com `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` ausentes
(ou inválidos), o app abre em **fail-closed**: `mobile/App.tsx` renderiza o
`FailClosedNotice` ("Build de desenvolvimento — M1 … nenhuma chamada de backend
é possível") e **nenhum** cliente Supabase é criado (`mobile/src/config.ts`
`resolveSupabaseConfig` retorna `null`; `mobile/src/supabase.ts` `getSupabaseClient`).
Nenhuma tela tenta login/backend nesse estado, e nenhum erro cru de ambiente
é exibido.

## 4. Comportamento esperado de auth/deep-link (contratos do repositório)

Baseado somente nos contratos versionados:

| Ação | Comportamento esperado (ambas plataformas) | Primitiva canônica |
| --- | --- | --- |
| Abrir o app sem sessão | Tela de autenticação VERAH ("Entrar"/"Criar conta", Google, email/senha) | `mobile/src/AuthScreen.tsx`; `mobile/src/auth-session.ts` |
| Reabrir com sessão persistida | "Restaurando sessão…" → jornada do backend (garagem, veículos, histórico) | `mobile/src/supabase.ts` (`persistSession: true`, `autoRefreshToken: true`; AsyncStorage); `mobile/src/AuthGate.tsx` |
| Login/cadastro email/senha | Erro com copy amigável (sem SQL/schema-cache); cadastro → aviso de confirmação de e-mail se o projeto exigir | `mobile/src/AuthScreen.tsx`; `mobile/src/auth-session.ts` |
| Google OAuth | Abre URL de auth no navegador; retorno em `verah-dev://auth/callback` troca code por sessão (ou `access_token`/`refresh_token` por hash) | `mobile/src/supabase.ts` (`signInWithGoogle` `redirectTo: "verah-dev://auth/callback"`, `handleAuthUrl` via `Linking`); `mobile/src/AuthGate.tsx` |
| Sign-out | Volta para autenticação; nenhum estado órfão local | `mobile/src/auth-session.ts` (`SIGNED_OUT`→`signed-out`); `mobile/src/AuthGate.tsx` |

## 5. Passos físicos/TestFlight — Human Gates futuros (NÃO executados aqui)

Cada item abaixo **exige ação humana** Apple/loja e **não é executado por este
pack**. Ao chegar em um, **parar** e seguir o gate correspondente
(`docs/ship-verah/release-1.0-build-readiness-checklist.md`).

| Gate | Ação humana mínima (exata) | Quando |
| --- | --- | --- |
| A1 | **Conta/programa Apple Developer**: criar/conceder acesso à conta e ao Team ID | build iOS em dispositivo físico / TestFlight |
| A2 | **App ID / bundle de produção (irreversível)**: registrar bundle de produção (ex.: `com.verah.app`, a definir por fundador) no Apple Developer / Identifiers | antes de TestFlight / App Store |
| A3 | **Signing/provisioning**: rodar `eas credentials` para distribuição (certificado + provisioning profile) após A1/A2 | build de device / submission |
| A4 | **TestFlight**: subir build assinado pelo EAS (profile `preview` ou `store-preview`) e convidar testers | beta interno real (M4) |
| A5 | **Publicação App Store**: submeter e publicar após TestFlight/review | usuárias reais via loja |
| A6 | **Produção Supabase**: reconciliar/migrar banco de produção (`#83`) | antes de qualquer uso produção |

**Fail-closed:** se qualquer credencial/configuração externa Apple estiver **ausente**
(sem conta/team, sem App ID, sem certificado/provisioning), o build EAS para
device/TestFlight **falha antes de gerar artefato** (ou o EAS exige o gate):
nenhum fallback silencioso, nenhuma assinatura "de mentira", nenhum artefato
submetido. O caminho **Simulator** (`preview-simulator`) continua disponível
**sem** esses gates/credenciais (validado na seção 3).

## 6. Checklist de evidência para validação pós-gate

O smoke test físico Android (`docs/ship-verah/release-1.0-android-physical-smoke.md`, mergeado no
`main` via #246) define a sequência G1–G14 que se aplica igualmente ao iOS,
observadas as diferenças de instalação/signing documentadas neste arquivo.

Para a validação iOS **após** os gates A1–A4 serem executados por humano (e o
build instalado em device/TestFlight), o pack Android físico fornece a mesma
sequência determinística G1–G14 do smoke test**(mergeado no `main` via #246).

os **mesmos** checks de canônico/fail-closed aplicam-se ao iOS; as evidências
esperadas:

| # | Evidência a capturar | Critério |
| --- | --- | --- |
| E1 | Home inicial do build dev ("VERAH Dev") ou fail-closed sem env; sem texto cru | renderiza; branding dev explícito |
| E2 | Login/cadastro + sessão restaurada; deep link `verah-dev://auth/callback` funcional no Simulator/device | sem erro cru; retorno OAuth vira sessão |
| E3 | Onboarding/garagem/veículo recuperado do backend | mesmos dados do Android (Supabase canônico; sem estado local paralelo) |
| E4 | Veículo/ownership/`service_request` com `customer_id`+`created_by` via `createMobileServiceRequest` | RLS owner-based; `referenceCode` `VRH-…` |
| E5 | Combustível (**L**) vs recarga (**kWh**) distintos; sem conversão inventada L↔kWh; contratos `register_vehicle_fuel`/`register_vehicle_charging` | unidades corretas em ambas as plataformas |
| E6 | Despesas/custo-por-km, manutenções/lembretes, documentos privados; contratos `vehicle_expense_summary`/`register_vehicle_maintenance`/`confirm_customer_vehicle` | mesmos contratos RPC/RLS do Android |
| E7 | Sign-out/sign-in e multi-dispositivo | dados canônicos do backend, não locais |
| E8 | Falha de fonte/backend → copy amigável, sem PGRST/schema-cache/SQL | fail-closed em todas as telas |

Captura de evidência: somente **tela/resultado** — screenshots/screen recording,
sem PII, sem secrets, sem SQL/detalhe de schema. Ao compartilhar vídeo com tela
de atendimento, desfoque endereço/coordenadas de retirada.



## Referências verificáveis (check automatizado em `tests/ios-readiness-references.test.mjs`)

- `docs/ship-verah/release-1.0-ios-readiness.md`
- `docs/ship-verah/release-1.0-build-readiness-checklist.md`
- `mobile/app.json`
- `mobile/eas.json`
- `mobile/App.tsx`
- `mobile/src/config.ts`
- `mobile/src/supabase.ts`
- `mobile/src/AuthGate.tsx`
- `mobile/src/AuthScreen.tsx`
- `mobile/src/auth-session.ts`
- `mobile/src/customer-journey.ts`
- `mobile/src/service-request-supabase.ts`
- `mobile/src/service-request.ts`
- `docs/ci.md`
- `docs/runbooks/supabase-production-reconciliation.md`
- `docs/runbooks/supabase-reconciliation-manifest.md`