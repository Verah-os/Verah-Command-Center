# Release 1.0 — Integration / Merge Sequencing Map (Issue #249)

Data: 2026-09-12. Base inspected: `main` em `c71ec30` (pós-merges `#236/#239/#240/#242/#244/#246/#248/#256`). Atualização desta branch: rebase sobre `main` `c71ec30` e reconciliação do mapa com o estado real das Drafts abertas `#254/#255/#258` (+ esta própria `#250`). Método: cada PR foi inspecionada do estado GitHub atual (base SHA, head SHA, changed files, check-runs) via API; nenhum merge, nenhum banco remoto, nenhuma ação externa foi executada. Refs: #164, #228/#229, #233, #234, #235, #236, #237, #238, #239, #240, #241, #242, #243, #244, #245, #246, #247, #248, #251, #252, #253, #255, #256, #257, #258, #83.

## 1. Veredito executivo

O mapa base original (desta PR #250) cobria 7 Drafts (`#236/#239/#240/#242/#244/#246/#248`) que **todas mergearam na `main`** desde então (`c71ec30`). O conjunto **vivo** de Draft PRs Release 1.0 relevantes é agora `#250/#254/#255/#258` — todas **repository-safe, pairwise file-disjoint e semanticamente ordenáveis** — **zero colisão de arquivo** entre todos os pares (93 paths únicos somados os 12 conjuntos de ownership, ver Seção 4). Nenhuma delas toca contrato canônico de backend/migration produzido (migrations/schema/RLS permanecem intocadas;pela #242 já mergeada, `scripts/ci/test-database.sh` fica **somente** sob ownership da #242, hoje na `main`).

**CI atual**:as 4 Drafts abertas estao com `Required` ⇒ `success` (jobs `Application`, `Database authorization`, `Mobile workspace` verdes) e `Supabase Preview` ⇒ `skipped` (sem rede não-prod acionada); `Vercel Preview Comments` ⇒ `success` em todas. Esta PR (#250) foi rebaseada sobre `main` `c71ec30` (head `41341e3`; reconcile `6ae9a8a`; `mergeable: true`, `mergeable_state: blocked` por ser Draft — gate humano, não conflito);as demais 3 (`#254/#255/#258`) estao `mergeable_state: behind` (a `main` avançou de `d391782` → `c71ec30` após os 8 merges; nenhuma em `conflict`) — rebase limpa esperada., nenhum conflito textual previsto.

## 2. Contexto mergeado (já na main; não re-ordenado nest mapa)

| PR | Merge commit (na main) | Arquivos | Papel no Release 1.0 |
| --- | --- | --- | --- |
| #236 | `c459b27` |16 (`app/(command)/clientes/**`, `app/(command)/dashboard/page.tsx`, `components/app-shell.tsx`, `components/customer-crm/**`, `docs/customer-crm-v1.md`, `modules/registry.ts`, `services/customer-crm/**`, `tests/customer-crm.test.mjs`, `vercel.json`) | Fundação CRM web canônica (leitura admin; Ficha Cliente 360°; fail-closed) |
| #239 | `e95c53f` |2 (`docs/alpha-5-operations-runbook.md`, `docs/handoffs/2026-09-10-issue-237-alpha5-runbook-readiness.md`) | Runbook operacional Alpha 5 + checklist prontidão |
| #240 | `be65bcb` |1 (`docs/crm-leads-v0.md`) | CRM Leads V0 — arquitetura canônica e plano Lead→Cliente |
| #242 | `981ef0b` |3 (`docs/customer-360-telemetry-v1.md`, `scripts/ci/test-database.sh`, `supabase/tests/customer_360_telemetry_read.sql`) | Matriz telemetria Cliente 360° V1.1 + umbrella RLS read-only registrado em `ci:database` (única PR a tocar `scripts/ci/test-database.sh`) |
| #244 | `8c04e4c` |4 (`mobile/src/FuelHistoryScreen.tsx`, `mobile/src/customer-journey.ts`, `mobile/tests/customer-journey.test.mjs`, `mobile/tests/telemetry-availability.test.mjs`) | Fix mobile fail-closed telemetria — energia (combustível/recarga independentes), home fail-closed |
| #246 | `bd90691` |2 (`docs/ship-verah/release-1.0-android-physical-smoke.md`, `tests/android-smoke-pack-references.test.mjs`) | Android physical smoke-test pack + static reference check |
| #248 | `c71ec30` |3 (`docs/handoffs/2026-09-11-issue-247-ios-readiness.md`, `docs/ship-verah/release-1.0-ios-readiness.md`, `tests/ios-readiness-references.test.mjs`) | iOS repository-safe readiness/preflight + static reference check |
| #256 | `3afe690` |2 (`docs/ship-verah/release-1.0-staging-migrations-runbook.md`, `tests/staging-migrations-sequence.test.mjs`) | Mapa/check estático da sequência exata de migrations Release 1.0 (53 versões congeladas; aplicação remota continua Human Gate separado H1) |

PRs fora do Release 1.0 (para registro,, não no mapa de merge): `#145` (docs Gemini,, `#151` (bootstrap instruções OpenHands) — Draft/abertas, sem arquivos comuns com o conjunto vivo e fora do escopo desta issue. 

##3. Matriz por PR Draft aberta ( issue → PR)

| PR | Propósito (deliverable) | Base SHA | Head SHA | CI (head) | Depende de | Land antes de |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #250 | Mapa base de merge sequencing ((Issue #249): `docs/ship-verah/release-1.0-merge-sequencing.md`, `docs/handoffs/2026-09-11-issue-249-merge-sequencing-map.md`, `tests/release-1.0-merge-sequencing-references.test.mjs`) | `c71ec30` | `41341e3` | `Required` success; `Supabase Preview` skipped; `Vercel Preview Comments` success | cobre todo o contexto mergeado (#236/#239/#240/#242/#244/#246/#248/#256) e as abertas #254/#255/#258 (as 3 inspecionadas); rebaseada sobre `main` `c71ec30` | **#250 antes de #254/#255/#258** (mapa canônico existir na `main` antes das próximas landings; #258 cita este mapa como referência histórica) |
| #254 | Customer-facing UX copy/accessibility/readability QA pack: `docs/ship-verah/release-1.0-ux-accessibility-pack.md`, `docs/handoffs/2026-09-11-issue-251-ux-accessibility-pack.md`, `tests/release-1.0-ux-accessibility-copy-references.test.mjs`, `mobile/App.tsx`, `mobile/src/fipe-catalog.ts`, `mobile/src/service-request-supabase.ts`, `mobile/src/vehicle-documents.ts`, `mobile/tests/vehicle-documents.test.mjs` | `d391782` | `f0eb19220` | `Required` success (idem) | #244 **semanticamente** (F5/F6 — telas `FuelHistoryScreen.tsx`/`customer-journey.ts` donas da #244); #250 como mapa-base | **antes de #255** (strings de copy/fallback fixadas primeiro; retint final do DS depois) |
| #255 | **VERAH Design System V1** — unificação visual Web + Mobile (`docs/design-system-v1.md`, `tailwind.config.ts`, `app/globals.css`, `next-env.d.ts`, retint de **46 arquivos**: telas web `app/**`, componentes `components/**`, telas mobile `mobile/src/*`) | `e95c53f` | `bd240e483` | `Required` success (idem) | #254 **semanticamente** (retinta telas auditadas por #254; **sem** implementar F5/F6 — o diff é só troca de tokens de cor `#177F78`/`#2AA79B` → `#814455`/`#E8B6C0`; nenhum `accessibilityLabel`/`accessibilityRole`/`maxFontSizeMultiplier` adicionado,, verificado no diff) | **última do pipeline aberto** (retint final sobre código estável pós-#250/#254) |
| #258 | Delta de refresh do mapa de integração (Issue #257): `docs/ship-verah/release-1.0-integration-map-refresh-254-255-256.md`, `docs/handoffs/2026-09-11-issue-257-integration-map-refresh.md`, `tests/release-1.0-integration-map-refresh-references.test.mjs` | `c459b27` | `cd6737b41` | `Required` success (idem) | #250 (cita o mapa base como histórico); incorporou #254/#255/#256 ao conjunto vivo | depois de #250/#254/#255 (o delta documenta as landings; seu conteúdo é agora em grande parte subsumido por este mapa canônico atualizado,, mas permanece válido como registro histórico/handoff) |

##3.1 Contratos canônicos e invariantes — PRs abertas**

| Contrato / invariante | #250 (mapa/docs) | #254 (mobile copy/a11y) | #255 (retint DS) | #258 (refresh/docs)) |
| --- | :-: | :-: | :-: | :-: |
| `customers` / `customer_channels` / `customer_vehicles` | preserva (docs; #236 mergeada na `main`) | preserva (copy; sem tocar read-model) | preserva (retint apenas) | preserva (docs) |
| `service_requests` / `service_request_events` | preserva (docs) | preserva (copy RPC mobile; sem mudar RPC) | preserva (retint apenas) | preserva (docs) |
| `customer_id` / ownership / `created_by` | preserva (docs; sem inferência) | preserva (copy; IDs canônicos preservados) | preserva (sem tocar lógica) | preserva (docs) |
| mileage / fuel / charging (litros e kWh separados) | preserva (docs; sem conversão inventada) | preserva (copy/unidades; `mobile/src/service-request-supabase.ts`/`fipe-catalog.ts`/`vehicle-documents.ts` sem conversão) | preserva (retint; não toca `FuelHistoryScreen.tsx`/`customer-journey.ts` — donos #244) | preserva (docs) |
| expenses / maintenance / documents / RLS / auth / `requireRole(["admin"])` | preserva (docs; fail-closed) | preserva (copy; sem tocar RLS/RPC de auth) | preserva (UI apenas) | preserva (docs) |

##4. Sobreposição de arquivos (verificado) + sobreposição semântica

Verificação automática pairwise sobre os **93 paths únicos** dos 12 conjuntos de ownership (#236/#239/#240/#242/#244/#246/#248/#256 mergeados + #250/#254/#255/#258 abertas): **zero arquivo tocado por mais de uma PR**. Detalhe por PR aberta:**

| PR | nº arquivos | Paths | Overlap de arquivo |
| --- | :-: | --- | --- |
| #250 |3 | `docs/handoffs/2026-09-11-issue-249-merge-sequencing-map.md`, `docs/ship-verah/release-1.0-merge-sequencing.md`, `tests/release-1.0-merge-sequencing-references.test.mjs` | Nenhum |
| #254 |8 | `docs/handoffs/2026-09-11-issue-251-ux-accessibility-pack.md`, `docs/ship-verah/release-1.0-ux-accessibility-pack.md`, `mobile/App.tsx`, `mobile/src/fipe-catalog.ts`, `mobile/src/service-request-supabase.ts`, `mobile/src/vehicle-documents.ts`, `mobile/tests/vehicle-documents.test.mjs`, `tests/release-1.0-ux-accessibility-copy-references.test.mjs` | Nenhum |
| #255 |46 | `app/(command)/concierge/[id]/page.tsx`, `app/(command)/concierge/novo-atendimento/page.tsx`, `app/(command)/concierge/page.tsx`, `app/(command)/settings/commercial/page.tsx`, `app/demo/cliente/atendimento/[id]/page.tsx`, `app/demo/cliente/garantias/page.tsx`, `app/demo/cliente/historico/page.tsx`, `app/demo/cliente/novo-atendimento/page.tsx`, `app/demo/cliente/page.tsx`, `app/demo/cliente/veiculo/[id]/page.tsx`, `app/demo/cliente/veiculos/page.tsx`, `app/demo/concierge/loading.tsx`, `app/demo/concierge/page.tsx`, `app/demo/page.tsx`, `app/demo/prestador/atendimento/[id]/page.tsx`, `app/demo/prestador/page.tsx`, `app/demo/whatsapp/page.tsx`, `app/demo/whatsapp/submit-button.tsx`, `app/entrar/cliente/cadastro/page.tsx`, `app/entrar/cliente/page.tsx`, `app/entrar/concierge/page.tsx`, `app/entrar/prestador/cadastro/page.tsx`, `app/entrar/prestador/page.tsx`, `app/globals.css`, `app/onboarding/cliente/page.tsx`, `app/onboarding/prestador/page.tsx`, `components/concierge/demo-decision-panel.tsx`, `components/concierge/provider-assignment-form.tsx`, `components/concierge/provider-trust-panel.tsx`, `components/customer/customer-shell.tsx`, `components/customer/vehicle-edit-form.tsx`, `components/demo/customer-answers-form.tsx`, `components/demo/quote-form.tsx`, `components/demo/service-request-form.tsx`, `docs/design-system-v1.md`, `mobile/src/AuthGate.tsx`, `mobile/src/AuthScreen.tsx`, `mobile/src/CustomerHome.tsx`, `mobile/src/CustomerJourney.tsx`, `mobile/src/CustomerRequests.tsx`, `mobile/src/MaintenanceScreen.tsx`, `mobile/src/MileageHistoryScreen.tsx`, `mobile/src/VehicleDocumentsScreen.tsx`, `mobile/src/VehicleOnboardingStep.tsx`, `next-env.d.ts`, `tailwind.config.ts` | Nenhum (nem contra #236/#256 mergeadas) |
| #258 |3 | `docs/handoffs/2026-09-11-issue-257-integration-map-refresh.md`, `docs/ship-verah/release-1.0-integration-map-refresh-254-255-256.md`, `tests/release-1.0-integration-map-refresh-references.test.mjs` | Nenhum |

Contexto mergeado (não re-ordenado; conjuntos listados individualmente para ownership/collision guard):
- `#236` 16 paths: `app/(command)/clientes/[id]/loading.tsx`, `app/(command)/clientes/[id]/not-found.tsx`, `app/(command)/clientes/[id]/page.tsx`, `app/(command)/clientes/error.tsx`, `app/(command)/clientes/loading.tsx`, `app/(command)/clientes/page.tsx`, `app/(command)/dashboard/page.tsx`, `components/app-shell.tsx`, `components/customer-crm/dashboard-metrics.tsx`, `components/customer-crm/panels.tsx`, `docs/customer-crm-v1.md`, `modules/registry.ts`, `services/customer-crm/read-model.ts`, `services/customer-crm/service.ts`, `tests/customer-crm.test.mjs`, `vercel.json` — interseção vazia com todos os pares.

- `#239` 2 paths: `docs/alpha-5-operations-runbook.md`, `docs/handoffs/2026-09-10-issue-237-alpha5-runbook-readiness.md`.
- `#240` 1 path: `docs/crm-leads-v0.md`.
- `#242` 3 paths: `docs/customer-360-telemetry-v1.md`, `scripts/ci/test-database.sh`, `supabase/tests/customer_360_telemetry_read.sql`.
- `#244` 4 paths: `mobile/src/FuelHistoryScreen.tsx`, `mobile/src/customer-journey.ts`, `mobile/tests/customer-journey.test.mjs`, `mobile/tests/telemetry-availability.test.mjs`.
- `#246` 2 paths: `docs/ship-verah/release-1.0-android-physical-smoke.md`, `tests/android-smoke-pack-references.test.mjs`.
- `#248` 3 paths: `docs/handoffs/2026-09-11-issue-247-ios-readiness.md`, `docs/ship-verah/release-1.0-ios-readiness.md`, `tests/ios-readiness-references.test.mjs`.
- `#256` 2 paths: `docs/ship-verah/release-1.0-staging-migrations-runbook.md`, `tests/staging-migrations-sequence.test.mjs`.

Verificado via API na data desta atualização: **zero arquivo partilhado** entre qualquer par dos 12 conjuntos ( 93 paths únicos, interseção vazia).

Sobreposição **semântica** (não de arquivo) — o motivo da ordem recomendada:

| Par | Tipo | Motivo | Resolução |
| --- | --- | --- | --- |
| #254 ↔ #255 | semântica (tokens de cor vs copy/a11y) | #255 retinta 10 telas mobile que #254 auditou (`mobile/src/AuthGate.tsx`, `mobile/src/AuthScreen.tsx`, `mobile/src/CustomerHome.tsx`, `mobile/src/CustomerRequests.tsx`, `mobile/src/CustomerJourney.tsx`, `mobile/src/MaintenanceScreen.tsx`, `mobile/src/MileageHistoryScreen.tsx`, `mobile/src/VehicleDocumentsScreen.tsx`, `mobile/src/VehicleOnboardingStep.tsx`) — mas **zero file overlap** (`mobile/App.tsx` e os 3 `.ts` de copy são só da #254; os `StyleSheet.create` retintados são só da #255). O diff da #255 **não** adiciona `accessibilityLabel`/`accessibilityRole`/`maxFontSizeMultiplier` (F5/F6 do pack #254 permanecem **abertos/blocked** por ownership da #255) | Merge #254 antes de #255 (strings customer-safe fixadas primeiro; retint final depois); F5/F6 seguem como follow-up pós-Release( verificação de contraste real é [FÍSICO], não reivindicado) |
| #254 ↔ #244 (mergeada) | semântica (F5/F6 vs telemetria) | F5 e F6 dependeriam de `mobile/src/FuelHistoryScreen.tsx` e `mobile/src/customer-journey.ts` — **donos da #244, já na `main`** — e de telas da #255; o pack #254 **não** toca esses arquivos | Merge #244 (na `main`) antes de #254 (cumprido); F5/F6 ficam **blocked** até #255 landed,, sem edição por colisão |
| #255 ↔ #244 (mergeada) | semântica leve ( retint vs telemetria) | #255 **não** toca `mobile/src/FuelHistoryScreen.tsx` nem `customer-journey.ts`; o retint visual não altera copy nem unidades L/kWh | Nenhum blocker; ordem #244 → #255 recomendada só para o retint final ser sobre código estável (cumprida) |
| #250 ↔ #258 | **não colisão** por design: #258 não edita os 3 arquivos donos da #250; usa paths novos próprios; o delta cita o mapa base como histórico | #250 first,, #258 depois (mapa canônico atualizado substitui em conteúdo o delta; ambos coexistem sem conflito) |
| #254 ↔ #258 / #255 ↔ #258 | docs+dados distintos; zero file overlap (verificado) | Nenhum; #258 apenas documenta as anteriores |

Não há conflito **textual/merge** entre nenhum par aberto (inclusive #254 vs #255 vs #244). `scripts/ci/test-database.sh` continua,, na `main`, sendo tocado **somente** por #242;; `tailwind.config.ts`/`app/globals.css`/`docs/design-system-v1.md` somente por #255;; `mobile/App.tsx` somente por #254;; `mobile/src/FuelHistoryScreen.tsx`/`customer-journey.ts` somente por #244 (já mergeada);; `docs/ship-verah/release-1.0-merge-sequencing.md` e irmãos somente por #250;; paths `*-integration-map-refresh-*` somente por #258..

##5. Ordem de merge recomendada (determinística**

**Ordem canônica**(contexto mergeado já na `main`, depois o conjunto aberto):**
`#236 ✅` → `#239 ✅` → `#240 ✅` → `#242 ✅` → `#244 ✅` → `#246 ✅` → `#248 ✅` → `#256 ✅` → **`#250` → `#254` → `#255` → `#258`**.

Ordem aberta (explicitamente): **`#250` → `#254` → `#255` → `#258`**.

Ordem preserva backend/identidade/ownership/`service_request`/telemetria/RLS/auth e minimiza rebases:

| Passo | PR | Porquê (ordem) | Rebase/revalidação obrigatória antes do merge |
| --- | --- | --- | --- |
| 0 | (gate) | Nenhum merge sem `main` verde em `c71ec30` + CI run mais recente success | `git fetch origin main`; conferir `origin/main == c71ec30` (ou head pós-`#248/#256` seguinte); `pnpm ci:application`, `pnpm ci:database`, `cd mobile && pnpm run check` verdes locais/CI |
|  1 | **#250** | Mapa canônico base ( esta PR; rebaseada na `main` `c71ec30`}; #254/#255/#258 dependem dele semanticamente (.#258 cita-o como histórico) | Rebase sobre `main` `c71ec30` (feito; `41341e3`; reconcile `6ae9a8a`); `node --experimental-strip-types --test tests/release-1.0-merge-sequencing-references.test.mjs` (estático,, sem rede/sem deps;; incluído em `pnpm test`); raiz `pnpm test`, typecheck, lint, build; CI `Required` success |
| 2 | **#254** | UX copy/accessibility pack (strings customer-safe em arquivos sem dono;8 paths próprios); semanticamente pós-#244 (na `main`) e pós-#250 (mapa) | Rebase sobre `main` pós-#250; `node tests/release-1.0-ux-accessibility-copy-references.test.mjs`; `cd mobile && pnpm test`; raiz `pnpm test`; CI `Required` success |
| 3 | **#255** | **Design System V1** — retint final Web+Mobile (46 paths; troca de tokens de cor; sem F5/F6;aplicar sobre o código já estável pós-#244/#250/#254) | Rebase pós-#254; `cd mobile && pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`; conferir `tailwind.config.ts`/`globals.css` coerentes com `docs/design-system-v1.md`; CI `Required` success |
| 4 | **#258** | Delta de refresh (documenta o conjunto vivo #250/#254/#255/#256; agora subsumido em conteúdo por este mapa canônico; permanece como registro histórico/handoff; zero overlap) | Rebase pós-#255; `node tests/release-1.0-integration-map-refresh-references.test.mjs` (estático;; incluído em `pnpm test`); raiz `pnpm test`; CI `Required` success (os 2 testes `integration-map-refresh` só passam quando o doc desta #258 existir na `main` — após o merge da #258,, ambos verdes) |

Nota (passo 1): `tests/public-entrypoints.test.mjs` falha neste sandbox por `ERR_MODULE_NOT_FOUND: package "typescript"` — `node_modules` raiz não instalado; a mesma falha ocorre na base `c71ec30` sem estes arquivos; **não é regressão desta PR** e é inexistente no CI (que instala dependências via `pnpm install --frozen-lockfile`).

Cada passo termina com **CI verde no head da PR** (`Required` ⇒ `success`) **e** **merge one-at-a-time na `main`**, com rebase do próximo passo imediatamente após cada merge.**

##6. Verificação pós-merge (gates exatos

Após cada merge,, antes do próximo passo:

| Gate | Comando/verificação | Falha ⇒(stop rule) |
| --- | --- | --- | --- |
| V1 | `git fetch origin main && git rev-parse origin/main` | SHA inesperado ⇒ parar e registrar |
| V2 | GitHub Actions run no merge commit: `Application`, `Database authorization`, `Mobile workspace`, `Required` ⇒ `success` | qualquer `failure` ⇒ parar,, investigar,, reverter/consertar antes de prosseguir |
| V3 | Conferir que a `main` ainda preserva os contratos canônicos: `customer_id`, `created_by`, `confirm_customer_vehicle`, `register_vehicle_fuel`, `register_vehicle_charging`, `register_vehicle_maintenance`, `vehicle_expense_summary`, `createMobileServiceRequest`, L/kWh separados | qualquer contrato ausente/alterado inesperadamente ⇒ parar (fail-closed) e registrar |
| V4 | `pnpm ci:database` (suite RLS/autorização em banco isolado do runner) | qualquer teste SQL vermelho ⇒ parar e reverter |
| V5 | Rebase do próximo PR sobre a nova `main` + checks do passo correspondente((Seção 5) | conflito não resolvível de forma repository-safe ⇒ parar e registrar blocker |

##7. Human Gates (separados; **não executados** por esta issue

Nenhum destes é parte do merge sequencing; permanecem gates externos/humanos e **não são acionados** por esta issue nem por nenhuma das Drafts abertas (também não foram acionados pelos merges já realizados das #236/#239/#240/#242/#244/#246/#248/#256 — eles só cobrem os passos humanos):

| # | Gate | Ação mínima humana | Quando |
| --- | --- | --- | --- |
| H1 | Aplicação de migrations remotas no Supabase **não-produção** | humano autorizado aplica as migrations aprovadas (#233 entre outras; sequência congelada em `#256/3afe690`) no projeto não-prod usado pelo preview | após merges da Seção 5; **separado** ( issue #83/#206 documentam o plano de produção/reconciliação; nada aqui) |
| H2 | Validação em dispositivo real((Android/iOS) com o schema não-prod aplicado | seguir os smoke packs #246/#248 pós-gate H1 | após H1 |
| H3 | Produção Supabase / reconciliação (`#83`) | humano responsável pelo banco reaplica/reconcilia migrations e verifica RLS/auth em produção | antes de produção real; fora do Release 1.0 pipeline repo-safe |
| H4 | Contas/credenciais Apple Developer((Team ID,, App ID/bundle irreversível,, signing/provisioning,, TestFlight,, App Store) | registradas/configuradas manualmente | distribuição iOS((Release 1.0); nenhuma ação desta issue |
| H5 | Contas/credenciais Google Play((package de produção,, AAB,, teste fechado,, publicação) | registradas/configuradas manualmente | distribuição Android((Release 1.0) |
| H6 | Pagamentos reais / mensagens reais((WhatsApp/n8n) | operação comercial humana; nenhum pagamento/mensagem real é enviado por nenhuma PR | fora do escopo repo-safe; nunca em Draft/CI |
| H7 | Secrets / produção / deploy | nenhum secret é acessado/rotacionado; nenhum deploy/deploy preview fora do padrão repo verificado | sempre humano e explícito |

##8. Stop / rollback fail-closed

Regra geral: **parar e registrar o blocker exato**; jamais forçar merge,, contornar RLS,, aplicar migration remota,, acessar secrets,, enviar pagamento/mensagem real ou publicar App/loja como parte desta issue. Condições de stop:

| Condição | Ação |
| --- | --- |
| Qualquer PR fica `non-mergeable`((conflito,, `behind` por mudança inesperada,,,, CI vermelho) | parar o passo; registrar PR,, base/head SHA,, paths conflitantes,, CI run URL; não rebase forçada de outra Draft; não alterar o código da PR problemática a menos que causa repository-safe comprovada |
| Contrato canônico mudar inesperadamente((schema,, RLS,, `customer_id`, `created_by`, L/kWh,,,, RPC listados em V3) | parar e registrar o diff suspeito; nenhuma correção silenciosa |
| Overlap não resolvível de forma repository-safe entre Draft PRs | parar; registrar os pares e o motivo; escalar para humano |
| CI regride pós-merge((qualquer job `Required` vermelho) | parar; reverter o merge((se possível) e registrar o run ID; nenhum merge adicional |
| PR citada (`#250/#254/#255/#258`, ou contexto `#236/#239/#240/#242/#244/#246/#248/#256`) for fechada/mergeada com SHA diferente do inspecionado | re-verificar o mapa((Seção 2/3) antes de prosseguir; apenas docs/static check desta issue são re-validados |
| Esta issue perde o escopo repo-safe((ex.: tentativa de merge,, migration remota,,,, secret,, publicação) | parar imediatamente; nenhuma ação adicional |

## Invariantes preservados((resumo

- Supabase/backend canônico continua a única fonte da verdade; nada de estado paralelo..
- Identidade e `customer_id` canônicos; auth provider é método de login,, não identidade..
- Vehicle ownership e `service_request` canônicos (`customer_id` + `created_by`); sem inferência por nome/telefone/placa..
- Mileage e fuel/charging((litros **e** kWh **separados**, sem conversão inventada) preservados..
- Expenses,, maintenance,, documents e RLS/auth preservados; fail-closed para source indisponível..
- Nenhum dado sintético representado como real; nenhuma migration remota; nenhum merge executado por esta issue((incluindo os já ocorridos — este mapa apenas os documenta)..
- Nenhum arquivo dono de outra Draft/PR foi editado por esta atualização((apenas os 3 arquivos próprios da #250 foram reescritos,, em paths isolados)...

## Referências
- EPIC #164; auditoria de aceitação #228/#229((mergeada em `9d6f9f8`); `#233`((mergeada em `c8692247`); `#234`((mergeada em `d391782`).
- Contexto mergeado após esta branch: `#236` (`c459b27`), `#239` (`e95c53f`), `#240` (`be65bcb`), `#242` (`981ef0b`), `#244` (`8c04e4c`), `#246` (`bd90691`), `#248` (`c71ec30`), `#256` (`3afe690`).
- Draft PRs abertas inspecionadas: #250 ( esta),, #254,, #255,, #258..
- Testes estáticos: `tests/release-1.0-merge-sequencing-references.test.mjs`((esta PR),,, `tests/release-1.0-ux-accessibility-copy-references.test.mjs` (#254),,, `tests/release-1.0-integration-map-refresh-references.test.mjs` (#258..
- Human Gate de produção/reconciliação:`#83`; plano de produção documentado em `docs/issue-43-production-migration-plan.md`.

