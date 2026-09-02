# VERAH Mobile (scaffold M1 — épico #164)

App iOS/Android da VERAH (React Native + Expo). Estado atual: **scaffold**
com smoke screen e cliente Supabase fail-closed. Estritamente não-produção.

## Arquitetura

- Mesmo projeto Supabase do Command Center: Auth email/senha, PostgREST com
  RLS owner-based e RPCs de onboarding (`docs/ship-verah/audit-release-1.0.md`).
- Nenhum backend paralelo, nenhuma Server Action (web-only) reutilizada.
- Somente variáveis públicas: `EXPO_PUBLIC_SUPABASE_URL` e
  `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Nunca service role ou secrets server-side.
- Sessão persistida com AsyncStorage (`src/supabase.ts`).

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

## Próximo passo (Auth Mobile — M1, dependência ordenada)

Nada aqui é produção; usar apenas projeto Supabase de desenvolvimento:

```bash
cd mobile
pnpm install --frozen-lockfile
pnpm run check   # porta de compatibilidade antes de abrir telas de auth
EXPO_PUBLIC_SUPABASE_URL=https://<projeto-dev>.supabase.co \
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key-dev> \
pnpm start       # Expo Go / dev client em ambiente não-prod
```

O contrato de identidade é `user_profiles`/`verah_identities` do mesmo
Supabase (ver `docs/ship-verah/master-plan.md`, marco M1 item 2).

## Limites

- Identifiers `com.verah.app.dev` / scheme `verah-dev` são de desenvolvimento;
  identidade de loja, contas Apple/Google, signing e publicação são HUMAN gates.
- Sem pagamentos, mensagens reais, migrações remotas ou dados de produção.
- Próximos passos ordenados: `docs/ship-verah/master-plan.md`.
