# Release 1.0 — Build Readiness Checklist (não-produção até os Human Gates)

Data: 2026-09-09. Base: `main` `d5541e2`. Objetivo: checklist acionável
ate os **Human Gates** de assinatura/publicação — **nenhuma ação externa é executada
 por esta auditoria**. Escopo: Android internal preview e iOS build readiness com
 os perfis EAS existentes (`mobile/eas.json`). Refs: #164, #181, #211, #212, #228.

## Pré-requisitos repo-safe (todos verificados verdes neste executor)

| Check | Comando | Resultado |
| --- | --- | --- |
| Mobile tests | `cd mobile && pnpm test` | **65 pass** |
| Mobile typecheck | `cd mobile && pnpm typecheck` | **ok** |
| Expo Doctor | `cd mobile && pnpm dlx expo-doctor@1` | **20/20** |
| Web tests | `pnpm test` | **282 pass** |
| Web typecheck+lint+build | `pnpm typecheck && pnpm lint && pnpm build` | **ok** |
| Database authorization CI | `pnpm ci:database` | **success** (52 migrations, 40 SQL tests, lint) |
| CI remota na `main` | GitHub Actions run #34330134195 | **success** (`d5541e2`) |

## Perfis EAS existentes (`mobile/eas.json`)

| Profile | Distribuição | Android | iOS | Uso |
| --- | --- | --- | --- | --- |
| `preview` | interna (`internal`) | APK (`buildType: apk`) | `.app` (simulador? ver nota) | Internal preview Android/iOS dev |
| `preview-simulator` | (herda `preview`) | — | `.app` Simulator (`ios.simulator: true`) | iOS Simulator local |
| `store-preview` | store | AAB (`app-bundle`) | `.app` device | Prévia de loja (HUMAN gate de credenciais) |
| `production` | store | AAB (`app-bundle`) | `.app` device | Produção (HUMAN gate final) |

Nota: no `preview` atual `ios.simulator: false` mas `distribution: internal` —
para iOS físico será necessário conta **Apple Developer** + `eas credentials`
(ver Human Gates).

## Passos acionáveis até os Human Gates

### 1. Conta Expo/EAS (HUMAN gate do fundador)

```bash
cd mobile
pnpm dlx eas-cli@latest login
pnpm dlx eas-cli@latest build:configure
```

### 2. Variáveis públicas EAS

No EAS Build em nuvem as variáveis públicas entram como environment variables do
projeto (o `.env` local é gitignored e o EAS não o lê):

```bash
cd mobile
pnpm dlx eas-cli@latest env:create --name EXPO_PUBLIC_SUPABASE_URL --scope project
pnpm dlx eas-cli@latest env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --scope project
```

Valores: projeto **não-produção** (NUNCA service role nem qualquer secret server-side);
contrato fail-closed em `mobile/src/config.ts`.

### 3. Build interno Android — APK instalável

```bash
cd mobile
pnpm dlx eas-cli@latest build --profile preview --platform android
```

Instalação do artifact:

```bash
adb install <arquivo>.apk
```

### 4. Build iOS — Simulator (sem assinatura)

```bash
cd mobile
pnpm dlx eas-cli@latest build --profile preview-simulator --platform ios
```

Instalação no Simulator:

```bash
xcrun simctl install booted <caminho-do-.app>
```

### 5. iOS em dispositivo físico — exige Apple Developer (HUMAN gate)

```bash
# usar o profile preview para dispositivo físico após o gate de credenciais
```

### 6. TestFlight / internal testing Android — HUMAN gates

Apple requer App ID/bundle de produção e distribuição via TestFlight. Google requer package de produção e AAB para internal testing.

### 7. Publicação (fora do escopo deste audit)

App Store e Google Play exigem assinatura, submissão e revisão humana.

### 8. Ativação de produção no Supabase (HUMAN gate, #83)

Antes de qualquer dado/uso de produção, seguir
`docs/runbooks/supabase-production-reconciliation.md` e
`docs/runbooks/supabase-reconciliation-manifest.md` (#83). Nenhuma migração remota
é executada por esta auditoria.

## Human Gates explícitos (fail-closed)

| # | Gate | Dono | Ação exigida | Impede |
| --- | --- | --- | --- | --- |
| 1 | Conta Expo/EAS | Fundador | autenticar no EAS e vincular o projeto | qualquer build EAS |
| 2 | Variáveis públicas EAS | Fundador | configurar as duas `EXPO_PUBLIC_*` do projeto não-prod | app cloud aponta ao Supabase não-prod |
| 3 | Apple Developer | Fundador | conta/programa Apple Developer e credenciais de distribuição | build iOS físico / TestFlight |
| 4 | Apple App ID/bundle | Fundador | registrar bundle de produção no Apple Developer | TestFlight / App Store |
| 5 | Google Play package | Fundador | registrar package de produção no Play Console | internal testing Android / Play |
| 6 | Signing/credenciais de loja | Fundador | assinatura de distribuição (Apple/Google) | submissão/publicação |
| 7 | Publicação | Fundador | submeter e publicar nas lojas | usuárias reais via loja |
| 8 | Produção Supabase | Fundador | reconciliar/migrar banco produção (#83) | qualquer uso de produção |

## Riscos e não-escopo

- Identifiers atuais `com.verah.app.dev` / scheme `verah-dev` são de desenvolvimento;
  identidade de loja, contas, signing e publicação são **Human Gates**.
- Sem push notifications no 1.0 ate decisão de credenciais FCM/APNs (ver
  `docs/ship-verah/audit-release-1.0.md` "Riscos").
- Demo/sandbox/fixture jamais representado como produção.