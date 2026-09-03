# VERAH Mobile (M1 — épico #164)

App iOS/Android da VERAH (React Native + Expo). Estado atual: **auth M1
(#169)** + **onboarding básico + garagem (#173)** — fluxo pós-login com
perfil básico (nome de preferência + termos Pilot Alpha v1), cadastro manual
do veículo com confirmação explícita e garagem persistida, tudo sobre o
cliente Supabase fail-closed. Estritamente não-produção.

## Arquitetura

- Mesmo projeto Supabase do Command Center: Auth email/senha, PostgREST com
  RLS owner-based e RPCs de onboarding (`docs/ship-verah/audit-release-1.0.md`).
- Nenhum backend paralelo, nenhuma Server Action (web-only) reutilizada.
- Somente variáveis públicas: `EXPO_PUBLIC_SUPABASE_URL` e
  `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Nunca service role ou secrets server-side.
- Sessão persistida com AsyncStorage (`src/supabase.ts`); máquinas de estado
  puras e testáveis em Node (`src/auth-session.ts`, `src/customer-journey.ts`);
  telas em `src/AuthGate.tsx`, `src/AuthScreen.tsx` e `src/CustomerJourney.tsx`.

## Jornada pós-login (contrato canônico #139)

1. `refresh_customer_onboarding` restaura a jornada e roteia para a etapa
   correta (perfil básico → veículo → garagem). Se não houver identidade de
   cliente (cadastro feito pelo app), `start_customer_onboarding` é chamado
   uma única vez (RPC idempotente) e a leitura é repetida; qualquer falha
   cai em estado de erro fail-closed com retry.
2. Perfil básico: `complete_customer_basic_onboarding` com
   `p_terms_version = pilot-alpha-onboarding-v1` e aceite explícito.
3. Veículo: cadastro manual (mobile não usa fixture de lookup — proveniência
   `lookup_source = 'manual'`) via RPC `confirm_customer_vehicle` com
   `p_customer_confirmed = true`. Criação de veículo é RPC-only; insert
   direto em `customer_vehicles` é revogado de `authenticated`.
4. Garagem: leitura de `customer_vehicles` sob RLS owner-based, ordenada por
   `created_at`.

## Como rodar (desenvolvimento)

Workspace com lockfile **isolado** (`mobile/pnpm-lock.yaml`), fora do pnpm
workspace da raiz — decisão da issue #167: o `pnpm install --frozen-lockfile`
da CI web permanece intocado e o Metro/Expo recebe o layout hoisted de
`node_modules` via `mobile/.npmrc` (`node-linker=hoisted`), sem afetar o app
web. Gerenciador: pnpm 9.15.9 (mesmo da raiz).

```bash
cd mobile
pnpm install --frozen-lockfile   # reproduzível a partir de checkout limpo
pnpm run check                   # typecheck (tsc --noEmit) + expo-doctor
EXPO_PUBLIC_SUPABASE_URL=https://<projeto-dev>.supabase.co \
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key-dev> \
pnpm start
```

Sem as variáveis o app abre em modo fail-closed (sem chamadas de backend).

## Validação local

```bash
cd mobile
pnpm install --frozen-lockfile
pnpm run check   # testes (auth/sessão + jornada onboarding/garagem) + typecheck + expo-doctor
EXPO_PUBLIC_SUPABASE_URL=https://<projeto-dev>.supabase.co \
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key-dev> \
pnpm start       # Expo Go / dev client em ambiente não-prod
```

O contrato de identidade continua sendo `user_profiles`/`verah_identities`
do mesmo Supabase (ver `docs/ship-verah/master-plan.md`, marco M1 item 2).

## Build instalável (EAS, somente não-prod — issue #181)

Config de build interno/dev: `mobile/eas.json`, profile `preview` —
distribuição interna, **sem publicação em loja**. Android gera APK
instalável (`buildType: apk`); iOS gera `.app` para **Simulator**
(sem assinatura/Apple Developer). Fluxo M1 preservado — nenhuma mudança de
produto, somente config de build.

### Variáveis públicas (sem secrets)

O app embute somente `EXPO_PUBLIC_SUPABASE_URL` e
`EXPO_PUBLIC_SUPABASE_ANON_KEY` (contrato fail-closed em
`src/config.ts`; anon key de projeto não-prod, nunca service role).
Modelo em `.env.example` (placeholders, sem valores).

- **Dev local:** copie `.env.example` para `.env` (gitignored).
- **EAS Build (nuvem):** cadastre como EAS environment variables —
  `eas env:create --name EXPO_PUBLIC_SUPABASE_URL --scope project` (idem para
  `EXPO_PUBLIC_SUPABASE_ANON_KEY`). Valores reais nunca vão em código, log
  ou PR.

### HUMAN gate — executar o build exige conta humana

Rodar `eas build` exige login em conta Expo/EAS (`EXPO_TOKEN` ou
`eas login`) — **gate humano do fundador**. Neste executor não havia
credencial EAS disponível, então o build **não foi gerado**; somente a
config foi validada. Ações humanas mínimas, na ordem:

```bash
cd mobile
pnpm dlx eas-cli@latest login       # 1. conta Expo/EAS (HUMAN gate)
pnpm dlx eas-cli@latest build:configure  # 2. vincula o projeto EAS
```

Depois, o comando reproduzível de build interno:

```bash
cd mobile
# Android — APK interno instalável:
pnpm dlx eas-cli@latest build --profile preview --platform android
# iOS — .app para Simulator (sem assinatura):
pnpm dlx eas-cli@latest build --profile preview --platform ios
```

Instalação do artifact interno:

- **Android:** baixe o APK do link do EAS e `adb install <arquivo>.apk`
  (ou abra o link no dispositivo com "instalar apps de fontes desconhecidas").
- **iOS Simulator:** baixe o `.app`/`.tar.gz` e
  `xcrun simctl install booted app.tar.gz` descompactado (ou arraste para o
  Simulator).

### iOS em dispositivo físico (adicional HUMAN gate)

O profile `preview` usa `ios.simulator: true` justamente para evitar
credenciais. Build em hardware exige conta **Apple Developer** (certificado +
provisioning) — gate humano: mude `ios.simulator` para `false` em
`eas.json` e rode `eas credentials`. Nunca publicar em App Store/Google Play;
escopo é somente distribuição interna não-prod.

## Limites

- Identifiers `com.verah.app.dev` / scheme `verah-dev` são de desenvolvimento;
  identidade de loja, contas Apple/Google, signing e publicação são HUMAN gates.
- Sem pagamentos, mensagens reais, migrações remotas ou dados de produção.
- Próximos passos ordenados: `docs/ship-verah/master-plan.md`.
