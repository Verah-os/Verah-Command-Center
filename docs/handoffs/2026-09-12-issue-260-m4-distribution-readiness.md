# Handoff — Issue #260: M4 Distribuição (executável até Human Gates reais)

Data: 2026-09-12. Branch: `openhands/m4-distribution-readiness-260`. PR Draft
aberta (ver issue #260). Refs: #164, #246, #248, #250, #254, #255, #258.

## Entregue nesta PR

- **Auditoria objetiva** da config de app/EAS/store readiness em `main` — estoque
  versionado em `docs/ship-verah/release-1.0-m4-distribution-readiness.md` (seção 1).
- **Config repository-safe**: `mobile/app.json` — `ios.buildNumber: "1"` e
  `android.versionCode: 1`, requeridos para `eas.json` `cli.appVersionSource: "local"`
  (build/submit não-interativo; remove prompt de versão).
- **Checklist de loja** (test #260 acceptance): privacy URL, data safety/App Privacy,
  screenshots, ícone, classificação, release notes — com modelos editáveis (seção 5–6).
- **Teste de referência** `tests/release-1.0-m4-distribution-references.test.mjs`
  (padrão dos packs anteriores) + **handoff** (este arquivo).

## Estado real de M4 / Human Gates (não executei ações externas)

Nenhuma credencial EAS/Expo, Apple ou Google existe neste executor. Portanto **não foi
executado**: `eas build`, `eas submit`, assinatura/provisioning, registro de App ID/
package de produção, TestFlight/closed-testing, submissão ou publicação. Esses são
**Human Gates legítimos** (login/2FA, adesão paga, contrato, dado fiscal, secret
privado, ação pessoal de plataforma) e estão **listados de forma mínima e objetiva** na
seção 3/4 do doc de readiness.

Ação humana mínima (lista exaustiva para quem quiser executar):

1. Login EAS/Expo + variáveis públicas EAS non-prod (build APK/simulador).
2. Identifiers de produção (`com.verah.app` candidato) e contas Apple/Google pagas.
3. Privacy Policy URL institucional + dados fiscais/legais.
4. Supabase de produção via runbooks #83 antes de uso real.

## Validação executada

- `cd mobile && pnpm test` → 87 pass; `pnpm typecheck` → ok;
  `pnpm dlx expo-doctor@1` → 20/20.
- Web: `pnpm test` (com o novo reference test) + typecheck + lint (executado abaixo).
- CI da PR (`CI / Application`, `CI / Database authorization`, `CI / Mobile workspace`)
  como fonte da verdade.

## Invariantes preservados

Identidade/ownership/`service_request` canônicos; RLS/fail-closed; litros e kWh
distintos; append-only; nenhum dado demo como produção; nenhum secret em código/logs.

## Bloqueio/risco

Publicação real (App Store/Play) permanece bloqueada por conta/adesão/assinatura/
dados legais do fundador — nenhuma ação deste executor pode removê-la. Sem outro risco
conhecido.