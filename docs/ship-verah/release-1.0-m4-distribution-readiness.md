# Release 1.0 — M4 Distribuição: estoque repository-safe, store metadata e checklist (Issue #260)

Data: 2026-09-12. Base: `main` `730bf7a` (pós-merge de #248/#250/#254/#255/#258).
Refs: #164 (épico), #246 (iOS-readiness), #247/#248, #249/#250 (merge sequencing),
#251/#254 (UX/accessibility), #257/#258 (integration-map refresh), #260 (este pack).

Escopo: **auditoria objetiva + preparação repository-safe até os Human Gates reais de
publicação**. Nenhuma ação externa é executada por esta auditoria (repository-safe,
fail-closed): nenhuma submissão,
build EAS remoto, assinatura/provisioning, credencial, conta Apple/Google, pagamento,
mensagem real, migration remota ou publicação. Tudo que exigir identidade humana da
Apple/Google/Expo fica registrado como **Human Gate explícito** na seção 5.

## 0. Invariantes preservados

Supabase canônico como única fonte da verdade; identidade
`user_profiles`/`verah_identities`/`customers` canônica (auth provider é método de
login, não identidade); `customer_id`/veículo ownership/`service_request`;
quilometragem não regressiva; combustível/recarga com litros (L) e kWh **distintos**,
sem conversão inventada; despesas; manutenções; documentos; RLS/auth e fail-closed
(leitura/gravação indisponível nunca vira dado fictício nem texto cru de backend).
Demo/sandbox/fixture nunca representado como produção. Sem secrets em código/logs/PRs.

**Contratos canônicos preservados (não duplicados):** `confirm_customer_vehicle`,
`replace_customer_vehicle`, `register_vehicle_mileage`, `register_vehicle_fuel`,
`register_vehicle_charging`, `register_vehicle_maintenance`, `vehicle_expense_summary`,
`createMobileServiceRequest` e o vínculo `customer_id`/`created_by` de
`service_requests` — todos RPC/RLS owner-based com fail-closed, conforme
`docs/ship-verah/release-1.0-ios-readiness.md`.

## 1. Configuração de app versionada — estoque atual (auditado em `main`)

| Item | Valor versionado | Arquivo | Observação para loja |
| --- | --- | --- | --- |
| Nome | `VERAH Dev` | `mobile/app.json` (`expo.name`) | branding explícito de desenvolvimento; orientação de store = Human Gate |
| Slug | `verah` | `mobile/app.json` | identificador de projeto Expo (não App ID/package) |
| Scheme | `verah-dev` | `mobile/app.json` (`expo.scheme`) | deep link dev; usado por `mobile/src/supabase.ts` + `mobile/src/AuthGate.tsx`; scheme de loja = Human Gate |
| Bundle ID iOS | `com.verah.app.dev` | `mobile/app.json` (`expo.ios.bundleIdentifier`) | **dev-only**; bundle de produção = Human Gate Apple |
| Package Android | `com.verah.app.dev` | `mobile/app.json` (`expo.android.package`) | **dev-only**; package de produção = Human Gate Google |
| `ios.buildNumber` | `1` | `mobile/app.json` (adicionado nesta PR) | versionamento determinístico com `eas.json` `appVersionSource: local` (evita prompt interativo de `eas build`) |
| `android.versionCode` | `1` | `mobile/app.json` (adicionado nesta PR) | idem; incremento obrigatório a cada upload Play Console |
| Tablet | `supportsTablet: false` | `mobile/app.json` | iPhone-first; habilitar iPad = decisão futura |
| Project ID EAS | `f971ac09-dad3-4ba5-8274-c8cbb1091cec` | `mobile/app.json` (`extra.eas.projectId`) | projeto EAS já vinculado pelo fundador (não é App ID Apple) |
| Plugin iOS | `expo-location` (permissão em português) | `mobile/app.json` (`expo.plugins`) | usado pelo fluxo `service_request` (pickup em primeiro plano, opcional) |
| Build profiles | `preview` / `preview-simulator` / `store-preview` / `production` | `mobile/eas.json` | `store-preview` e `production` são `distribution: store`; exigem credenciais de assinatura |

Com `eas.json` usando `cli.appVersionSource: "local"`, as versões vêm de `mobile/app.json`
(`version`, `ios.buildNumber`, `android.versionCode`) — **sem prompt interativo** durante
`eas build`/`eas submit`. Essa é a mudança de config repository-safe desta PR; os
identifiers dev, assinatura e publicação continuam Human Gates.

## 2. Validação determinística repository-safe (pré-flight estático)

Nenhum comando da tabela exige secret, conta Apple/Google ou assinatura. Executáveis em
CI/sandbox:

| # | Check | Comando | Resultado |
| --- | --- | --- | --- |
| 1 | Testes web (inclui `tests/release-1.0-m4-distribution-references.test.mjs`) | `pnpm test` | pass |
| 2 | Typecheck web | `pnpm typecheck` | ok |
| 3 | Lint web | `pnpm lint` | ok |
| 4 | Build web | `pnpm build` | ok |
| 5 | Testes mobile | `cd mobile && pnpm test` | pass |
| 6 | Typecheck mobile | `cd mobile && pnpm typecheck` | ok |
| 7 | Expo Doctor (config/plugins/versões) | `cd mobile && pnpm doctor` | 20/20 |
| 8 | Banco/autorização local (somente fixtures sintéticas; nenhum banco remoto) | `pnpm ci:database` | success |
| 9 | Fonte da verdade do CI | GitHub Actions da PR (`CI / Application`, `CI / Database authorization`, `CI / Mobile workspace`) | success |

## 3. Android — preparação para Play Console (até o Human Gate)

### 3.1 Repository-safe já existente

- Perfil EAS `store-preview`/`production` com `android.buildType: "app-bundle"` (AAB).
- Package dev `com.verah.app.dev`; package de produção **não escolhido** (Human Gate).
- `android.versionCode: 1` versionado (incrementar a cada upload).

### 3.2 Ações humanas mínimas (Gate)

1. **Play Console/contas e aceite legal** (Google Developer, dados fiscais, pagamento
   da conta e aceite do *Developer Distribution Agreement*) — Human Gate do fundador.
2. Escolher/registrar o **package de produção** (ex.: `com.verah.app`) e criar o app.
3. **Play App Signing** (subir a chave/upload key) — Human Gate de credencial privada.
4. Configurar **Data safety** no Play Console (formulário declarativo; a app coleta:
   conta/email, veículo do usuário, localização aproximada no fluxo de pedido de
   ajuda, documentos enviados pelo usuário; sem dados de crianças; sem SDK de
   publicidade/analytics de terceiros) — Human Gate pessoal.
5. **Classificação de conteúdo** (IARC/teste) — formulário externo, Human Gate.
6. Criar **closed/internal test** com a lista de testers e subir o AAB gerado por
   `eas build --profile store-preview --platform android` — Human Gate de conta.

Comando reproduzível para o build (após login EAS + variáveis públicas EAS do projeto
não-prod; ver `docs/ship-verah/release-1.0-build-readiness-checklist.md` seção 1–2):

```bash
cd mobile
pnpm dlx eas-cli@latest build --profile store-preview --platform android
```

## 4. iOS — preparação para App Store/TestFlight (até o Human Gate)

### 4.1 Repository-safe já existente

- Perfil EAS `store-preview`/`production` com `distribution: store` e
  `ios.simulator: false` (device build, exige assinatura).
- Bundle dev `com.verah.app.dev`; bundle de produção **não registrado** (Human Gate).
- `ios.buildNumber: "1"` versionado (incrementar a cada upload do TestFlight).
- `expo-location` com string de permissão em **português** — já declare a
  *Privacy Policy* e o *App Privacy/Nutrition Label* referenciando esse uso.

### 4.2 Ações humanas mínimas (Gate)

1. **Apple Developer Program** (conta + adesão paga + aceite de contrato) — Human Gate.
2. Criar/receber **App ID** com bundle de produção (ex.: `com.verah.app`), registrar
   **Team/Key**, gerar **certificado de distribuição e provisioning** (`eas credentials`)
   — Human Gate de segredo privado.
3. Criar o app no **App Store Connect**: metadata, **Privacy Policy URL**,
   **App Privacy (nutrition label)**, preço/territórios, categorias e
   **TestFlight (internal testers)** — Human Gate pessoal.
4. Build `.ipa` via `eas build --profile production --platform ios` e upload via
   `eas submit` (ou Transporter) — Human Gate de conta.
5. **Classificação etária** e review — formulários Apple, Human Gate.

Comando reproduzível (após gates acima):

```bash
cd mobile
pnpm dlx eas-cli@latest build --profile production --platform ios
pnpm dlx eas-cli@latest submit --platform ios --profile production
```

## 5. Checagens e estoque exigido pelas lojas — status

| Check | Android | iOS | Estado no repositório | Depende de Human Gate? |
| --- | --- | --- | --- | --- |
| App name (exibição) | Play listing | App Store name | `VERAH Dev` (dev, não-final) | Sim (decisão do fundador) |
| Short/full description | Play listing | — | não versionado | Sim |
| **Privacy Policy URL** | obrigatória | obrigatória | **não versionada** — placeholder registrado nesta PR | Sim |
| **Data safety / App Privacy nutrition label** | formulário Play | formulário ASC | dados declarativos na seção 3.2/4.2 | Sim (formulário Apple/Google) |
| Screenshots (6,5"/5,5" e 5,5"/6,7" etc.) | capturas | capturas | `docs/brand/verah-app-mockup.pptx`, `public/brand/app-mockup.jpg` (referência) | Sim (capturas reais do build) |
| Ícone | 512×512 | 1024×1024 | `public/brand/icon.png` (400×400) | Sim (render 1024) |
| Classificação etária | IARC | 4+ (estimado) | não versionado | Sim |
| Categoria | — | — | definida na conta | Sim |
| Release notes (This version) | 5k char | 4k char | rascunho na seção 7 | Não (template) |
| Versionamento (`ios.buildNumber`/`android.versionCode`) | `1` | `1` | **versionado nesta PR** | Não |
| Deep link dev documentado | — | — | `docs/ship-verah/release-1.0-ios-readiness.md` | Não |

Os modelos de *short description*, *release notes* e o texto de *privacy URL* abaixo são
**rascunhos** — a URL final de privacidade e os dados legais/fiscais são **Human Gate**.

## 6. Store metadata — rascunho editável (não-commit de produção)

**Short description (Android, candidata):**

> A VERAH cuida do seu carro: quilometragem, gastos, manutenção e lembrete do que está
> vencendo. Quando você precisa de ajuda, a VERAH conecta você à rede de atendimento.

**Release notes (This version, candidata):**

> Primeira versão da VERAH: crie sua conta, cadastre seu veículo e acompanhe
> quilometragem, abastecimentos, manutenções e documentos. Adicionar como piloto.

**Privacy Policy URL — placeholder:** `https://verah.app/privacidade` (domínio e texto
institucional ainda pertencem ao fundador — **Human Gate**). O texto recomendado cobre:
dados de conta (email), dados do veículo informados pelo usuário, localização
aproximada **somente** durante criação de atendimento (primeiro plano, opcional) e
documentos anexados pelo usuário; sem venda de dados; sem publicidade de terceiros.

## 7. Evidências de builds e estado real (não-secret) — Issue #260

Neste executor (2026-09-12) **não há credencial EAS/Expo, Apple ou Google disponível**:
`EXPO_TOKEN`/`EAS_TOKEN`/Apple Developer/Play Console ausentes. Logo, os builds/share
remotos e registros de App ID/package/App ID no ASC/PSC **não foram executados** — são
**Human Gates legítimos** (login/2FA, adesão paga, aceite de contrato, pacote/credencial
privada e ação pessoal de Apple/Google), conforme a regra operacional do #260.

O que **foi** validado e versionado nesta PR:

- Config de app móvel auditada e consistente com `docs/ship-verah/release-1.0-ios-readiness.md`;
- `ios.buildNumber`/`android.versionCode` adicionados (`appVersionSource: local`) —
  remove prompt interativo de `eas build`;
- Tests/typecheck/Expo Doctor verdes (seção 2);
- Este checklist + rascunhos de metadata/privacidade/release notes (seção 5–6).

Os **identifiers de produção** (`com.verah.app` candidato), assinatura, App Store
Connect/Play Console, contas e publicação final são do fundador — **nada é inventado,
registrado ou prometido em nome de terceiros** por este artefato.

## 8. Próximos passos (dependency-ordered)

1. Fundador: login EAS + variáveis públicas EAS (non-prod) — desbloqueia build APK/iOS
   Simulator (gates do `release-1.0-build-readiness-checklist.md`).
2. Fundador: decidir identifiers de produção (`com.verah.app`) e contas Apple/Google —
   desbloqueia TestFlight e closed/internal testing.
3. Fundador: ativar/migrar Supabase de produção conforme `#83` antes de qualquer uso
   real (Human Gate separado).
4. Esta PR não cria issue de backlog: os gates são documentados, não duplicados.