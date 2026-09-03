# Handoff — Issue #181 (primeiro build instalável VERAH mobile, M1)

- **Issue / PR:** #181 / Draft PR na branch `control-plane/issue-181`
- **Commit:** HEAD da branch `control-plane/issue-181` (base `main` `64bd0fe`)
- **Files changed:** `mobile/eas.json`, `mobile/.env.example`,
  `mobile/README.md`, `docs/handoffs/2026-09-03-issue-181-first-installable-build.md`
- **Behavior delivered:** configuração mínima e segura de build interno/dev
  (EAS profile `preview`, distribuição interna, sem loja): Android gera APK
  instalável; iOS gera `.app` de Simulator sem assinatura. Instrução
  reproduzível de build/instalação no `mobile/README.md`. Nenhuma mudança de
  produto — fluxo M1 (Auth → Onboarding → Garagem) intacto.
- **Focused tests:** `cd mobile && pnpm install --frozen-lockfile &&
  pnpm run check` → 26/26 testes, `tsc --noEmit` ok, expo-doctor 18/18.
- **Required checks:** CI remoto do PR (jobs `mobile` + `required`).
- **Invariant/decision discovered:** o app resolve fail-closed sem
  `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY`
  (`mobile/src/config.ts`); EAS Build não lê `.env` — em nuvem as variáveis
  públicas vão como EAS environment variables, nunca commitadas.
- **Remaining blocker/risk (HUMAN gate, fail-closed):** gerar o build exige
  conta Expo/EAS do fundador — confirmado nesta sessão:
  `eas build --profile preview --platform android --non-interactive` falha com
  "An Expo user account is required to proceed" (sem `EXPO_TOKEN`/login, sem
  Android SDK e sem toolchain iOS/macOS no executor). Ação humana mínima:
  `eas login` (ou `EXPO_TOKEN`) → `eas build:configure` →
  `eas env:create EXPO_PUBLIC_SUPABASE_URL/EXPO_PUBLIC_SUPABASE_ANON_KEY`
  (projeto não-prod) → `eas build --profile preview --platform android|ios`.
  iOS em dispositivo físico exige Apple Developer (gate humano adicional:
  `ios.simulator: false` + `eas credentials`).
- **Executor/model/duration/cost:** openhands/cloud-managed; duração ~1 sessão;
  custo n/d.

## Next session
Após o fundador executar o HUMAN gate (login EAS + env vars), rodar os dois
comandos de build do README e instalar o APK Android e o `.app` iOS Simulator.
Não iniciar M2.
