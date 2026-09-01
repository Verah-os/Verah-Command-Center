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

```bash
cd mobile
pnpm install   # ou npm install — decisão de workspaces é a issue #1 do plano
EXPO_PUBLIC_SUPABASE_URL=https://<projeto-dev>.supabase.co \
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key-dev> \
pnpm start
```

Sem as variáveis o app abre em modo fail-closed (sem chamadas de backend).

## Limites

- Identifiers `com.verah.app.dev` / scheme `verah-dev` são de desenvolvimento;
  identidade de loja, contas Apple/Google, signing e publicação são HUMAN gates.
- Sem pagamentos, mensagens reais, migrações remotas ou dados de produção.
- Próximos passos ordenados: `docs/ship-verah/master-plan.md`.
