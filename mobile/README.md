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

## Limites

- Identifiers `com.verah.app.dev` / scheme `verah-dev` são de desenvolvimento;
  identidade de loja, contas Apple/Google, signing e publicação são HUMAN gates.
- Sem pagamentos, mensagens reais, migrações remotas ou dados de produção.
- Próximos passos ordenados: `docs/ship-verah/master-plan.md`.
