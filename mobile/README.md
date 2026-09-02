# VERAH Mobile (M1 — épico #164)

App iOS/Android da VERAH (React Native + Expo). Estado atual: **auth M1**
(cadastro/login e-mail+senha, sessão persistida via AsyncStorage, restauração
na abertura, sign-out) sobre o cliente Supabase fail-closed. Estritamente
não-produção.

## Arquitetura

- Mesmo projeto Supabase do Command Center: Auth email/senha, PostgREST com
  RLS owner-based e RPCs de onboarding (`docs/ship-verah/audit-release-1.0.md`).
- Nenhum backend paralelo, nenhuma Server Action (web-only) reutilizada.
- Somente variáveis públicas: `EXPO_PUBLIC_SUPABASE_URL` e
  `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Nunca service role ou secrets server-side.
- Sessão persistida com AsyncStorage (`src/supabase.ts`); máquina de estado
  de auth pura e testável em Node (`src/auth-session.ts`); telas em
  `src/AuthGate.tsx` e `src/AuthScreen.tsx`.

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

## Próximo passo (Onboarding + garagem mobile — M1, dependência ordenada)

Auth está entregue (#169). A próxima entrega ordenada conecta as RPCs de
onboarding (`start_customer_onboarding`, `complete_customer_basic_onboarding`,
`refresh_customer_onboarding`) e a garagem (`customer_vehicles` via RLS,
`confirm_customer_vehicle` via RPC, contrato final do #139). Nada aqui é
produção; usar apenas projeto Supabase de desenvolvimento:

```bash
cd mobile
pnpm install --frozen-lockfile
pnpm run check   # testes de auth/sessão + typecheck + expo-doctor
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
