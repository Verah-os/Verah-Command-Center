# Handoff — Issue #247 (iOS Release 1.0 readiness/simulator preflight pack,

- **Issue / PR:** #247 / Draft PR (branch `openhands/247-release-1.0-ios-readiness`)
- **Commit:** `HEAD` da branch (rebaseada sobre `main` `bd90691` em 2026-09-12;
  base original `d391782`)
- **Files changed:** `docs/ship-verah/release-1.0-ios-readiness.md`,
  `tests/ios-readiness-references.test.mjs`
- **Behavior delivered:** auditoria repo-safe da config iOS/Expo/EAS versionada
  (`mobile/app.json`, `mobile/eas.json`, scheme/deep link `verah-dev://auth/callback`,
  bundle dev `com.verah.app.dev`, profiles EAS) c isolada preflight estático:

  docs de readiness iOS com caminho **Simulator** sem assinatura (profile
  `preview-simulator`), comandos repository-safe, comportamento esperado de
  auth/deep-link por contratos, fail-closed sem credenciais Apple, checklist de
  evidência pós-gate,a Human Gates A1–A6 exatos (nenhum executado);
  teste estático `tests/ios-readiness-references.test.mjs` validando referências,
  consistência scheme/EAS/mobile source, contratos canônicos,e unidades
  L/kWh distintas. Nenhuma ação externa Apple/loja/banco executada.

- **Focused tests:** `node --experimental-strip-types --test
  tests/ios-readiness-references.test.mjs` → 6/6 pass.

- **Validação executada neste executor ( rebase sobre `main` `bd90691`):**
  web tests **313 pass,, 0 fail**; typecheck web **ok**; lint web **ok**
  (1 warning pré-existente não-bloqueante); build Next.js **ok**; mobile tests
  **87 pass,, 0 fail**; typecheck mobile **ok**; Expo Doctor **20/20
  checks passed**. `Database authorization` (Docker/Supabase CLI) **não foi
  executado** neste executor( daemon Docker indisponível; a fonte da verdade é
  o CI da PR).

- **Required checks:** CI remoto da PR (Application,, Mobile workspace,, Database
  authorization}e `pnpm ci:database` local (se Docker disponível..
- **Invariant/decision discovered:** perfil `preview-simulator`(herda `preview`,
  `ios.simulator: true`) é o único caminho iOS **sem** exigir Apple Developer/signing;
  deep link `verah-dev://auth/callback` é o único scheme versionado; identifiers
  atuais são dev-only e sua troca por produção é Human Gate.. Rebase
  limpo sobre `bd90691`; nenhum conflito nem colisão—Drafts abertas
  **#250/#254/#255/#258/#151/#145** — nenhum arquivo tocado por elas é alterado aqui..

- **Remaining blocker/risk (HUMAN gate, fail-closed):** gerar build `.app` para
  Simulator exige conta humana Expo/EAS e gates prévios (P1–P4 do doc); iOS
  fisico/TestFlight exige Apple Developer + App ID + signing/provisioning (A1–A6,
  não executados).
- **Codex usage:** n/d.


## Next session
Após o fundador executar os Human Gates A1–A4 (`docs/ship-verah/
release-1.0-ios-readiness.md` seção 5)e gerar o build `preview-simulator`,
seguir a validação Simulator (seção 3)e depois o smoke Android/iOS pós-gate. Não
iniciar produção nem duplicar backlog. O gate de migration não-prod (`#83`) é
separado e não é tocado por este pack.
Drafts abertas atuais: #250/#254/#255/#258 (#151/#145 legadas); revalidar colisões antes de novos arquivos.