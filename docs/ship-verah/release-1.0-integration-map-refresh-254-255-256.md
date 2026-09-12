# Release 1.0 — Integration map refresh: estado pós-integração do pipeline (Issue #257 / PR #258)

Data: 2026-09-12. Base inspected: `main` em `79f5be0` (merge da `#255`, último PR do pipeline Release 1.0).
Método: cada PR do pipeline foi conferida do estado GitHub atual via API (files changed, check-runs,
merge SHA na `main`) e os diffs de merge foram verificados localmente via `git`; nenhum merge, nenhum
banco remoto, nenhuma ação externa foi executada por esta issue. Refs: #164, #228/#229, #83, #145/#151
(fora do pipeline).

Este documento é o **delta de refresh** do mapa base `#250`
(`docs/ship-verah/release-1.0-merge-sequencing.md`, mergeada na `main` em `da1d5d0`), **sem editar
arquivos da #250** (por regra de ownership, este refresh usa paths isolados novos: doc, handoff e teste
estático próprios). Atualização desta branch: **rebase sobre `main` `79f5be0`** e reconciliação com o
estado real: todas as PRs do pipeline Release 1.0 foram integradas; resta somente esta própria `#258`.

## 1. Veredito executivo

- **Todas as PRs do pipeline Release 1.0 foram integradas na `main`**:
`#256` `#236` `#239` `#240` `#242` `#244` `#246` `#248` `#250` `#254` `#255`
(11 conjuntos de ownership, 90 paths únicos no total — Seção 2/3).
- O conjunto **vivo** do pipeline Release 1.0 é agora **somente `#258` (este refresh)**.
  As demais PRs abertas do repositório (`#145`, `#151`) são **fora do pipeline** e não compartilham
  arquivo com nenhum conjunto integrado nem com este refresh.
- **Collision guard recalculado pós-integração**: este refresh usa **3 paths novos e isolados**,
  com **zero interseção** contra os 90 paths integrados e contra as PRs fora do pipeline
  (Seção 3). As duas interseções herdadas `#244 ∩ #255` e `#254 ∩ #255` foram **verificadas no diff de
  merge** como **exclusivamente retint de tokens de cor** (sem copy/a11y/unidades), mergeadas em
  sequência limpa (`behind`, não `conflict`).
- **CI**: a `main` em `79f5be0` tem status `success` (incl. `control-plane:runtime`,
  `Vercel`). A CI desta PR deve manter `Required` ⇒ `success` após o rebase; o teste estático
  desta issue é isolado (sem rede/sem deps).

## 2. Contexto integrado (todas na `main`; não reordenadas)

| PR | Merge commit (na `main`) | nº | Paths (ownership completo) | Papel no Release 1.0 |
| --- | --- | :-: | --- | --- |
| #256 | `3afe690` | 2 | `docs/ship-verah/release-1.0-staging-migrations-runbook.md`, `tests/staging-migrations-sequence.test.mjs` | Mapa/check estático da **sequência exata de migrations Release 1.0**; a aplicação **remota** das migrations não-prod permanece **Human Gate separado** (H1) |
| #236 | `c459b27` | 16 | `app/(command)/clientes/[id]/loading.tsx`, `app/(command)/clientes/[id]/not-found.tsx`, `app/(command)/clientes/[id]/page.tsx`, `app/(command)/clientes/error.tsx`, `app/(command)/clientes/loading.tsx`, `app/(command)/clientes/page.tsx`, `app/(command)/dashboard/page.tsx`, `components/app-shell.tsx`, `components/customer-crm/dashboard-metrics.tsx`, `components/customer-crm/panels.tsx`, `docs/customer-crm-v1.md`, `modules/registry.ts`, `services/customer-crm/read-model.ts`, `services/customer-crm/service.ts`, `tests/customer-crm.test.mjs`, `vercel.json` | Fundação CRM web canônica (Ficha Cliente 360°; fail-closed) |
| #239 | `e95c53f` | 2 | `docs/alpha-5-operations-runbook.md`, `docs/handoffs/2026-09-10-issue-237-alpha5-runbook-readiness.md` | Runbook operacional Alpha 5 + checklist prontidão |
| #240 | `be65bcb` | 1 | `docs/crm-leads-v0.md` | CRM Leads V0 — arquitetura canônica e plano Lead→Cliente |
| #242 | `981ef0b` | 3 | `docs/customer-360-telemetry-v1.md`, `scripts/ci/test-database.sh`, `supabase/tests/customer_360_telemetry_read.sql` | Matriz telemetria Cliente 360° V1.1 + umbrella RLS registrado em `ci:database` |
| #244 | `8c04e4c` | 4 | `mobile/src/FuelHistoryScreen.tsx`, `mobile/src/customer-journey.ts`, `mobile/tests/customer-journey.test.mjs`, `mobile/tests/telemetry-availability.test.mjs` | Fix mobile fail-closed telemetria — energia (combustível/recarga independentes) |
| #246 | `bd90691` | 2 | `docs/ship-verah/release-1.0-android-physical-smoke.md`, `tests/android-smoke-pack-references.test.mjs` | Android physical smoke-test pack + static reference check |
| #248 | `c71ec30` | 3 | `docs/handoffs/2026-09-11-issue-247-ios-readiness.md`, `docs/ship-verah/release-1.0-ios-readiness.md`, `tests/ios-readiness-references.test.mjs` | iOS repository-safe readiness/preflight + static reference check |
| #250 | `da1d5d0` | 3 | `docs/handoffs/2026-09-11-issue-249-merge-sequencing-map.md`, `docs/ship-verah/release-1.0-merge-sequencing.md`, `tests/release-1.0-merge-sequencing-references.test.mjs` | Mapa base de merge sequencing (Issue #249); referência histórica deste refresh |
| #254 | `586131b` | 8 | `docs/handoffs/2026-09-11-issue-251-ux-accessibility-pack.md`, `docs/ship-verah/release-1.0-ux-accessibility-pack.md`, `mobile/App.tsx`, `mobile/src/fipe-catalog.ts`, `mobile/src/service-request-supabase.ts`, `mobile/src/vehicle-documents.ts`, `mobile/tests/vehicle-documents.test.mjs`, `tests/release-1.0-ux-accessibility-copy-references.test.mjs` | Customer-facing UX copy/accessibility/readability QA pack |
| #255 | `79f5be0` | 48 | `app/(command)/concierge/[id]/page.tsx`, `app/(command)/concierge/novo-atendimento/page.tsx`, `app/(command)/concierge/page.tsx`, `app/(command)/settings/commercial/page.tsx`, `app/demo/cliente/atendimento/[id]/page.tsx`, `app/demo/cliente/garantias/page.tsx`, `app/demo/cliente/historico/page.tsx`, `app/demo/cliente/novo-atendimento/page.tsx`, `app/demo/cliente/page.tsx`, `app/demo/cliente/veiculo/[id]/page.tsx`, `app/demo/cliente/veiculos/page.tsx`, `app/demo/concierge/loading.tsx`, `app/demo/concierge/page.tsx`, `app/demo/page.tsx`, `app/demo/prestador/atendimento/[id]/page.tsx`, `app/demo/prestador/page.tsx`, `app/demo/whatsapp/page.tsx`, `app/demo/whatsapp/submit-button.tsx`, `app/entrar/cliente/cadastro/page.tsx`, `app/entrar/cliente/page.tsx`, `app/entrar/concierge/page.tsx`, `app/entrar/prestador/cadastro/page.tsx`, `app/entrar/prestador/page.tsx`, `app/globals.css`, `app/onboarding/cliente/page.tsx`, `app/onboarding/prestador/page.tsx`, `components/concierge/demo-decision-panel.tsx`, `components/concierge/provider-assignment-form.tsx`, `components/concierge/provider-trust-panel.tsx`, `components/customer/customer-shell.tsx`, `components/customer/vehicle-edit-form.tsx`, `components/demo/customer-answers-form.tsx`, `components/demo/quote-form.tsx`, `components/demo/service-request-form.tsx`, `docs/design-system-v1.md`, `mobile/App.tsx`, `mobile/src/AuthGate.tsx`, `mobile/src/AuthScreen.tsx`, `mobile/src/CustomerHome.tsx`, `mobile/src/CustomerJourney.tsx`, `mobile/src/CustomerRequests.tsx`, `mobile/src/FuelHistoryScreen.tsx`, `mobile/src/MaintenanceScreen.tsx`, `mobile/src/MileageHistoryScreen.tsx`, `mobile/src/VehicleDocumentsScreen.tsx`, `mobile/src/VehicleOnboardingStep.tsx`, `next-env.d.ts`, `tailwind.config.ts` | **VERAH Design System V1** — unificação visual (light/rose identity); **somente tokens de cor** (sem F5/F6) |

PRs fora do Release 1.0 (para registro; sem arquivos comuns com o pipeline): `#145`
(`GEMINI.md`), `#151` (`.openhands/skills/repo.md`).

## 3. Matriz pós-integração (o pipeline está na `main`)

Não há mais PR aberta do pipeline Release 1.0 a ordenar: **todos os 11 conjuntos de ownership
foram integrados** (#256 `3afe690`, #236 `c459b27`, #239 `e95c53f`, #240 `be65bcb`, #242 `981ef0b`,
#244 `8c04e4c`, #246 `bd90691`, #248 `c71ec30`, #250 `da1d5d0`, #254 `586131b`, #255 `79f5be0`).
O conjunto **vivo** do pipeline limita-se a esta própria `#258` (renomeada de issue #257), que é um
**delta (docs + teste estático) em paths novos**, sem tocar nenhum arquivo dono de PR do pipeline.

A ordem de merge executada na `main` (histórico confirmado via `git log --first-parent`):
**#256 → #236 → #239 → #240 → #242 → #244 → #246 → #248 → #250 → #254 → #255**.
A ordem recomendada do mapa base #250 e do delta anterior deste refresh foi respeitada
(#244 antes de #254/#255; #250 antes de #254/#255/#258; #255 por último após código estável).

PRs fora do Release 1.0 (para registro, não no mapa de merge): `#145` (`GEMINI.md`) e `#151`
(`.openhands/skills/repo.md`) — abertas, **sem arquivos comuns** com o pipeline integrado nem com
este refresh.

## 4. Sobreposição de arquivos (verificado) + sobreposição semântica

Verificação pairwise sobre os **90 paths únicos** dos 11 conjuntos integrados (#236/#239/#240/#242/
#244/#246/#248/#250/#254/#255/#256): os únicos arquivos tocados por **mais de um** conjunto são
heranças do rebase/merge e foram verificados no diff de merge da `#255` (`79f5be0^..79f5be0`):

| Interseção | Path(s) | Verificação do diff de merge |
| --- | --- | --- |
| `#244` ∩ `#255` | `mobile/src/FuelHistoryScreen.tsx` | **somente retint de tokens de cor** (`#177F78` → `#814455` nos `StyleSheet.create`); nenhuma mudança de copy/lógica/unidades; nenhum `accessibilityLabel`/`accessibilityRole`/`maxFontSizeMultiplier` adicionado |
| `#254` ∩ `#255` | `mobile/App.tsx` | **somente retint de token de cor** (`brand: color: "#177F78"` → `"#814455"`); nenhuma mudança de copy/a11y |

Ambas mergearam em sequência limpa (`behind`, não `conflict`). O **collision guard deste refresh** é:

| Conjunto | nº arquivos | Paths | Overlap com outro conjunto |
| --- | :-: | --- | --- |
| `#258` (este refresh) | 3 | `docs/ship-verah/release-1.0-integration-map-refresh-254-255-256.md`, `docs/handoffs/2026-09-11-issue-257-integration-map-refresh.md`, `tests/release-1.0-integration-map-refresh-references.test.mjs` | **Zero** — contra os 90 paths integrados (verificado via API + `git diff --name-only`) e contra as PRs abertas fora do pipeline (`#145`/`#151`) |

Sobreposição **semântica** herdada — confirmada **resolvida** pela ordem de merge executada:

| Par | Tipo | Resolução (executada) |
| --- | --- | --- |
| #254 ↔ #255 | semântica (copy/a11y vs retint) | `#254` mergeada em `586131b` **antes** da `#255` (`79f5be0`); o diff de merge da `#255` não adiciona `accessibilityLabel`/`accessibilityRole`/`maxFontSizeMultiplier`; F5/F6 permanecem **follow-up aberto** pós-Release, sem edição por colisão |
| #244 ↔ #254/#255 | semântica (telemetria/unidades vs copy e retint) | `#244` (`8c04e4c`) mergeada **antes** de #254/#255; L/kWh separados preservados no merge; `customer-journey.ts` ficou intocado pela #255 |
| #242 ↔ demais | file: único toque em `scripts/ci/test-database.sh` | `#242` (`981ef0b`) mergeada; `scripts/ci/test-database.sh` segue **somente** sob o conjunto da #242 na `main` |

**Nenhum conflito textual/merge** entre os 11 conjuntos na `main` final (`79f5be0`).

## 5. Estado de integração (ordem de merge executada)

**Ordem de merge executada na `main`:**
`#256` ✅ → `#236` ✅ → `#239` ✅ → `#240` ✅ → `#242` ✅ → `#244` ✅ → `#246` ✅ →
`#248` ✅ → `#250` ✅ → `#254` ✅ → `#255` ✅.

| Passo | PR | Merge commit | Verificação executada na `main` |
| --- | --- | --- | --- |
| 1–11 | (todas) | `3afe690`/`c459b27`/`e95c53f`/`be65bcb`/`981ef0b`/`8c04e4c`/`bd90691`/`c71ec30`/`da1d5d0`/`586131b`/`79f5be0` | `main` `79f5be0` com status `success` (jobs `Application`/`Database authorization`/`Mobile workspace` verdes histórico; status de commit `success` incl. `control-plane:runtime`, `Vercel`) |

**Único passo aberto restante — esta `#258` (delta):**

| PR | Porquê | Rebase/revalidação obrigatória antes do merge |
| --- | --- | --- |
| `#258` | Este refresh documental (3 paths novos, isolados); recálculo do collision guard pós-integração | `node tests/release-1.0-integration-map-refresh-references.test.mjs` (estático, sem rede/sem deps; incluído em `pnpm test`); raiz `pnpm test`, typecheck, lint; CI `Required` ⇒ `success`; `mergeable_state` sem `conflict` |

Verificação local neste refresh: `pnpm test` 338/338 verdes, `pnpm typecheck`, `pnpm lint` (zero
warnings/errors) e `pnpm build` verdes sobre `main` `79f5be0` (o `node_modules` raiz foi instalado;
sem regressão). CI desta PR (`Application`/`Database authorization`/`Mobile workspace`/`Required`)
roda com `pnpm install --frozen-lockfile`.


## 6. Human Gates (separados; **não executados** por esta issue)

Nenhum destes é parte do merge sequencing; permanecem gates externos/humanos e
**não** são acionados por esta issue nem por nenhuma PR do pipeline:

| # | Gate | Ação mínima humana | Quando |
| --- | --- | --- | --- |
| H1 | Aplicação de migrations remotas no Supabase **não-produção** | humano autorizado aplica as migrations aprovadas (#233 entre outras) no projeto não-prod usado pelo preview | após as integrações da Seção 5; **separado** (issue #83/#206 documentam o plano de produção/reconciliação; nada aqui; #256 apenas documentou a sequência, não a aplicou) |
| H2 | Validação em dispositivo real (Android/iOS) com o schema não-prod aplicado | seguir os smoke packs #246/#248 pós-gate H1 | após H1 |
| H3 | Produção Supabase / reconciliação (`#83`) | humano responsável pelo banco reaplica/reconcilia migrations e verifica RLS/auth em produção | antes de produção real; fora do Release 1.0 pipeline repo-safe |
| H4 | Contas/credenciais Apple Developer (Team ID, App ID/bundle irreversível, signing/provisioning, TestFlight, App Store) | registradas/configuradas manualmente | distribuição iOS (Release 1.0); nenhuma ação desta issue |
| H5 | Contas/credenciais Google Play (package de produção, AAB, teste fechado, Publicação) | registradas/configuradas manualmente | distribuição Android (Release 1.0) |
| H6 | Pagamentos reais / mensagens reais (WhatsApp/n8n) | operação comercial humana; nenhum pagamento/mensagem real é enviado por nenhuma PR | fora do escopo repo-safe; nunca em Draft/CI |
| H7 | Secrets / produção / deploy | nenhum secret é acessado/rotacionado; nenhum deploy/deploy preview fora do padrão repo verificado | sempre humano e explícito |


## 7. Stop / rollback fail-closed

Regra geral: **parar e registrar o blocker exato**; jamais forçar merge, contornar
RLS, aplicar migration remota, acessar secrets, enviar pagamento/mensagem real ou
publicar App/loja como parte desta issue. Condições de stop:

| Condição | Ação |
| --- | --- |
| Esta PR fica `non-mergeable` (conflito, `behind` por mudança inesperada, CI vermelho) | parar; registrar base/head SHA, paths conflitantes, CI run URL; sem rebase forçada nem alteração de código de outras PRs |
| Contrato canônico mudar inesperadamente (schema, RLS, `customer_id`, `created_by`, L/kWh, RPC) | parar e registrar o diff suspeito; nenhuma correção silenciosa |
| Overlap não resolvível de forma repository-safe entre PRs do pipeline | parar; registrar os pares e o motivo; escalar para humano |
| CI regride pós-integration (qualquer job `Required` vermelho na `main`) | parar; registrar o run ID; nenhum merge adicional |
| PR citada do pipeline for reaberta/alterada com SHA diferente do integrado | re-verificar o mapa (Seção 3) antes de prosseguir; apenas docs/static check desta issue são re-validados |
| Uma PR abrir caminho para tocar arquivo de outro conjunto (ownership overlap) | parar; registrar o par e o path; nenhum merge |
| Esta issue perde o escopo repo-safe (ex.: tentativa de merge, migration remota, secret, publicação) | parar imediatamente; nenhuma ação adicional |


## 8. Invariantes preservados (resumo)

Os contratos canônicos listados no gate V3 do mapa base #250 permanecem preservados na `main`
(`79f5be0`), verificados no diff de merge de cada PR do pipeline:

- Supabase/backend canônico continua a única fonte da verdade; nada de estado paralelo;
- Identidade e `customer_id` canônicos; auth provider é método de login, não identidade;
- Vehicle ownership e `service_request` canônicos (`customer_id` + `created_by`); sem inferência por nome/telefone/placa;
- RPCs de veículo/serviço canônicos preservados: `confirm_customer_vehicle`, `register_vehicle_fuel`,
  `register_vehicle_charging`, `register_vehicle_maintenance`, `vehicle_expense_summary`,
  `createMobileServiceRequest`;
- Mileage e fuel/charging (litros **e** kWh **separados**, sem conversão inventada; `litros e kWh`
  nunca viram um ao outro) preservados;
- Expenses, maintenance, documents e RLS/auth (incl. RPC protegidas e `requireRole`) preservados;
  fail-closed para source indisponível;
- Nenhum dado sintético representado como real; nenhuma migration remota; nenhum merge executado
  por esta issue;
- Design System #255 é **só tokens de cor** (sem F5/F6, sem copy, sem conversão); F5/F6 seguem como
  follow-up aberto pós-Release, sem edição por ownership.


## Referências
- EPIC #164; auditoria de aceitação #228/#229 (mergeada em `9d6f9f8`); `#233` (mergeada em `c8692247`);
  `#234` (mergeada em `d391782`); e as integrações do pipeline Release 1.0:
  `#256` (`3afe690`), `#236` (`c459b27`), `#239` (`e95c53f`), `#240` (`be65bcb`), `#242` (`981ef0b`),
  `#244` (`8c04e4c`), `#246` (`bd90691`), `#248` (`c71ec30`), `#250` (`da1d5d0`), `#254` (`586131b`),
  `#255` (`79f5be0` — `main` atual).
- Mapa base: `docs/ship-verah/release-1.0-merge-sequencing.md` (#250; não editado por este refresh).
- Teste estático desta issue: `tests/release-1.0-integration-map-refresh-references.test.mjs`.
- Human Gate de produção/reconciliação: `#83`; runbook de staging (documental, mergeado): `#256`.
[The command completed with exit code 0.]