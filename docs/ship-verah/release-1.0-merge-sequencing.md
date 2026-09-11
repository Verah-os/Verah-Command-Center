# Release 1.0 — Integration / Merge Sequencing Map (Issue #249)

Data: 2026-09-11. Base inspected: `main` em `d3917825d12356ed4bfff8ee1c7caa4e1b0196f1` (`#232/#234`).
Método: cada PR Draft aberta foi inspecionada do estado GitHub atual (base SHA, head SHA,
changed files, check-runs) via API; nenhum merge, nenhum banco remoto, nenhuma ação externa foi
executada. Refs: #164, #228/#229, #233, #234, #235, #236, #237, #238, #239, #240,
#241, #242, #243, #244, #245, #246, #247, #248, #83.

## 1. Veredito executivo

As 7 Draft PRs de Release 1.0 relevantes (`#236/#239/#240/#242/#244/#246/#248`)
são **repository-safe, pairwise file-disjoint e semanticamente ordenáveis** — zero
colisão de arquivo entre todos os pares (31 paths únicos, ver Seção 4). Nas houve
regressão de contrato canônico por esta issue: nada além de docs novos e um
teste estático novo foi criado, em paths não tocados por nenhuma PR aberta. O CI atual
de cada PR está verde (`Required` ⇒ `success` em todas as 7; `Supabase Preview` ⇒ `skipped`
em todas as 7; `#239/#240/#242/#244/#246/#248` também verdes em `Vercel Preview Comments`;
`#236` não tem `Vercel Preview Comments` — o `vercel.json` dela desativa deploy automático
daquela branch, conforme documentado na própria PR). Duas PRs
(`#236`, `#240`) estão `mergeable_state: behind` por falta de rebase sobre a `main` atual
(`d391782`, inclusão de `#234`); as demais 5 estão `clean`. Recomendação:
rebase+revalidação das 2 atrasadas antes do merge; ordem recomendada na Seção 5.



## 2. Matriz por PR Draft (issue → PR)

| PR | Issue | Propósito (deliverable) | Base SHA | Head SHA | CI (head) | Depende de | Land antes de |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #236 | #235 | CRM Clientes V1 web — leitura admin canônica (`customers`/`customer_channels`/`customer_vehicles`/`service_requests`/`service_request_events`), KPIs no dashboard, ficha Cliente 360°, fail-closed | `c8692247` | `d2248221` | `Required` success (`Application`, `Mobile workspace`, `Database authorization`; `Supabase Preview` skipped; sem `Vercel Preview Comments` — `vercel.json` desativa deploy da branch) | #233/#234 em `main` (rebasar de `c8692247` → `d391782`; CI deve permanecer verde pós-rebase) | **#236 antes de #240 e #242** (ambas referenciam/dependem semanticamente da superfície CRM). #239/#244/#246/#248 podem entrar antes ou depois (sem overlap, mas #246 e #248 citam-na); evitar ordem invertida para cópias de runtime |
| #239 | #237 | Runbook operacional Alpha 5 + checklist prontidão (`docs/alpha-5-operations-runbook.md` + handoff) | `d391782` | `694600c8` | `Required` success (idem acima). | `main` `d391782` (já inclui #233/#234) | Nenhuma (docs standalone) |
| #240 | #238 | CRM Leads V0 — arquitetura canônica e plano Lead→Cliente (`docs/crm-leads-v0.md`) | `c8692247` | `49b4effc` | `Required` success (idem acima; `Vercel Preview Comments` ok) | #236 **semanticamente** (funil referencia a superfície/ficha V1 #236 e ao bloqueio `23505`); rebase pós-#236 ou co-merge com ordem não invertida | **Depois de #236** (referencia rota/superfície futura da #236; não toca arquivos) |
| #242 | #241 | Matriz telemetria Cliente 360° V1.1 (docs) + umbrella RLS read-only (`supabase/tests/customer_360_telemetry_read.sql`) registrado na suíte `ci:database` | `d391782` | `7e6f80e8` | `Required` success (idem acima) | #233 em `main` (contratos telemetria); **pós-#236** semanticamente (seção "Integração pós-#236" e matriz assumem a ficha V1 e o `readRows` da #236) | **Depois de #236**; nada depende dela (docs standalone) |
| #244 | #243 | Mobile fail-closed telemetria — energia (combustível/recarga independentes), home fail-closed (`mobile/src/**`, testes) | `d391782` | `be72dcc0` | `Required` success (idem acima; `Supabase Preview` skipped) | `main` `d391782` (contratos #233) | #246 referencia-a como candidato de correção p/ R2/R3 (não bloqueia; ambos podem entrar em qualquer ordem; recomendado **#244 antes de #246** para o smoke pack descrever comportamento canônico pós-fix) |
| #246 | #245 | Android physical smoke-test pack + static reference check (`docs/ship-verah/release-1.0-android-physical-smoke.md`, `tests/android-smoke-pack-references.test.mjs`) | `d391782` | `07d1b849` | `Required` success (idem acima) | #236/#239/#240/#242/#244 já inspecionadas (sem arquivos tocados); R3 referencia **#244** como target canônico | **Depois de #244** recomendado (R3 descreve o comportamento pós-fix; co-merge tolerável); nada depende dela |
| #248 | #247 | iOS repository-safe readiness/preflight + static reference check (`docs/ship-verah/release-1.0-ios-readiness.md`, `tests/ios-readiness-references.test.mjs`, handoff) | `d391782` | `8532c30f` | `Required` success (idem acima) | #236/#239/#240/#242/#244/#246 inspecionadas (sem arquivos tocados); cita #246 (sequência G1–G14) e #244 | **Depois de #246** (cita a sequência do smoke Android/G1–G14; docs standalone); nada depende dela |

PRs fora do Release 1.0 (para registro, não no mapa de merge): `#145` (docs Gemini), `#151`
(bootstrap instrumções OpenHands) — Draft/abertas, sem arquivos comuns com as 7 acima e fora do
escopo desta issue.

## 3. Contratos canônicos tocados por PR

| Contrato / invariante | #236 | #239 | #240 | #242 | #244 | #246 | #248 |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| `customers` / `customer_channels` / `customer_vehicles` | uso leitura (projeções) | — (docs) | referência (docs) | referência binding (docs+umbrella) | — conserva | referência contrato (static test) | referência contrato (static test) |
| `service_requests` / `service_request_events` | uso leitura (KPIs/ficha) | referência (docs) | referência (docs) | referência (docs) | — conserva | referência RPC (static test) | referência RPC (static test) |
| `customer_id` / ownership / `created_by` | preserva (vínculo canônico, sem inferência) | preserva (docs) | preserva (binding fail-closed) | preserva (binding canônico id-only) | preserva (mobile ID/pool de veículo) | preserva (static test) | preserva (static test) |
| mileage (`vehicle_mileage_logs`) | — (limite V1) | preserva (docs) | — | matriz leitura admin (umbrella) | — conserva | referência contrato (static test) | referência contrato (static test) |
| fuel (`vehicle_fuel_logs`) | — (limite V1) | preserva (docs) | — | matriz leitura admin (umbrella) | fail-closed source availability | referência contrato (static test) | referência contrato (static test) |
| charging (`vehicle_charging_logs`, kWh) | — (limite V1) | preserva (docs) | — | matriz leitura admin (umbrella) | fail-closed source availability | referência contrato (static test, litros e kWh separados) | referência contrato (static test, litros e kWh separados) |
| expenses (`vehicle_expenses`) / cost-per-km | — (fora V1) | preserva (docs) | — | matriz (sem política admin hoje ⇒ fail-closed) | — conserva | referência contrato (static test) | referência contrato (static test) |
| maintenance (`vehicle_maintenance_records`) | — (fora V1) | preserva (docs) | — | matriz (sem política admin hoje ⇒ fail-closed) | — conserva | referência contrato (static test) | referência contrato (static test) |
| documents (`vehicle_documents`) | — (fora V1) | preserva (docs) | — | matriz metadata (sem política admin hoje ⇒ fail-closed) | — conserva | referência contrato (static test) | referência contrato (static test) |
| RLS / auth / `requireRole(["admin"])` | preserva (entradas admin; RLS ativa; sem ampliar concierge) | preserva (docs) | preserva (binding humano auditável) | preserva (umbrella read-only; sem bypass RLS) | preserva (sem tocar RLS) | preserva (static test) | preserva (static test) |
| Unidades L vs kWh | — | preserva | — | preserva (sem conversão) | preserva (fail-closed separado) | preserva (static test) | preserva (static test) |

## 4. Sobreposição de arquivos (verificado) + sobreposição semântica

Verificação automática pairwise sobre os 31 paths únicos das 7 PRs:
**zero arquivos tocados por mais de uma PR**. Detalhe:

| PR | Arquivos (paths) | Overlap de arquivo (com qualquer outra PR) |
| --- | --- | --- |
| #236 |16 (`app/(command)/clientes/[id]/loading.tsx`, `app/(command)/clientes/[id]/not-found.tsx`, `app/(command)/clientes/[id]/page.tsx`, `app/(command)/clientes/error.tsx`, `app/(command)/clientes/loading.tsx`, `app/(command)/clientes/page.tsx`, `app/(command)/dashboard/page.tsx`, `components/app-shell.tsx`, `components/customer-crm/dashboard-metrics.tsx`, `components/customer-crm/panels.tsx`, `docs/customer-crm-v1.md`, `modules/registry.ts`, `services/customer-crm/read-model.ts`, `services/customer-crm/service.ts`, `tests/customer-crm.test.mjs`, `vercel.json`) | **Nenhum** |
| #239 | 2 (`docs/alpha-5-operations-runbook.md`, `docs/handoffs/2026-09-10-issue-237-alpha5-runbook-readiness.md`) | **Nenhum** |
| #240 | 1 (`docs/crm-leads-v0.md`) | **Nenhum** |
| #242 | 3 (`docs/customer-360-telemetry-v1.md`, `scripts/ci/test-database.sh`, `supabase/tests/customer_360_telemetry_read.sql`) | **Nenhum** (modifica `scripts/ci/test-database.sh` em 2 blocos; única PR a tocar CI DB wiring) |
| #244 | 4 (`mobile/src/FuelHistoryScreen.tsx`, `mobile/src/customer-journey.ts`, `mobile/tests/customer-journey.test.mjs`, `mobile/tests/telemetry-availability.test.mjs`) | **Nenhum** (única PR a tocar mobile tests de disponibilidade) |
| #246 |  ́2 (`docs/ship-verah/release-1.0-android-physical-smoke.md`, `tests/android-smoke-pack-references.test.mjs`) | **Nenhum** |
| #248 | 3 (`docs/handoffs/2026-09-11-issue-247-ios-readiness.md`, `docs/ship-verah/release-1.0-ios-readiness.md`, `tests/ios-readiness-references.test.mjs`) | **Nenhum** |

Sobreposição **semântica** (não de arquivo) — o motivo da ordem recomendada:

| Par | Tipo | Motivo | Resolução |
| --- | --- | --- | --- |
| #236 → #240 | semântica (docs) | #240 referencia repetidamente a ficha/V1 da #236 (10× no doc), funil Lead→Cliente e rotas futuras `/leads`; binding `bound_whatsapp_unbound_contact` reutiliza fluxo da #236 | Merge #236 primeiro; #240 continua Draft/estável (docs standalone não quebra com rebase); se co-merge, manter ordem #236 → #240 |
| #236 → #242 | semântica (docs+umbrella) | #242 assume `readRows`/mecânica da ficha #236 (`docs/customer-360-telemetry-v1.md` seção "Integração pós-#236", 27× refs #236) e matriz de autorização idêntica (`requireRole(["admin"])`) | Merge #236 primeiro; #242 é repo-safe e green independente, mas a validação de **dados reais** pós-merge exige #236 na `main` |
| #244 → #246 | semântica (smoke pack) | #246 R2/R3 descrevem como **target** canônico o comportamento já corrigido por #244 (candidato #243/#244 citado) | Merge #244 antes de #246 para o pack descrever o comportamento real pós-merge; ambos podem co-existir sem conflito |
| #246 → #248 | semântica (iOS pack) | #248 cita os checks G1–G14 e o smoke físico Android da #246 (sequência determinística) | Merge #246 antes de #248 para as referências cruzadas serem verdadeiras na `main`; se #248 entrar primeiro, apenas a redação da referência fica temporariamente apontando para um Draft (docs ainda existem no repo, sem quebra) |
| #236/#240/#242 → #246/#248 | semântica (referências) | #246/#248 listam #236/#239/#240/#242/#244 como inspecionadas e citam `#83` (Human Gate) | Não requer ordem estrita; manter Draft PRs citadas abertas até seus merges, ou atualizar a redação pós-merge |

Não há conflito **textual/merge** entre nenhum par (inclusive #236 vs #242 vs
#244 vs #246 vs #248). O único arquivo híbrido compartilhado por *infraestrutura*
é `scripts/ci/test-database.sh`, tocado **somente** por #242; nenhuma outra PR mexe
nesse caminho. `middleware.ts` foi modificado por `#234` (já mergeado) e **não** por
nenhuma Draft. `app/page.tsx`/`app/home.module.css` idem (`#234`).

## 5. Ordem de merge recomendada (determinística)

**Ordem canônica:** `#236 → #239 → #240 → #242 → #244 → #246 → #248`.
Ordem preserva backend/identidade/ownership/`service_request`/telemetria/
RLS/auth e minimiza rebases:

| Passo | PR | Porquê (ordem) | Rebase/revalidação obrigatória antes do merge |
| --- | --- | --- | --- |
| 0 | (gate) | Nenhum merge sem `main` verde em `d391782` + CI run mais recente success | `git fetch origin main`; conferir `origin/main == d391782` (ou head pós-`#234` seguinte); `pnpm ci:application`, `pnpm ci:database`, `cd mobile && pnpm run check` verdes locais/CI |
| 1 | **#236** | Fundação CRM web canônica; #240/#242 dependem semanticamente; rebase necessário (`c8692247` → `d391782`); zero overlap | Rebase sobre `main` `d391782`; `pnpm ci:application` (test suite, typecheck, lint, build); `pnpm ci:database` (RLS em banco isolado do runner); config do `vercel.json` preservada; conflito (`app/(command)/dashboard/page.tsx` etc.) resolve-se pela redação da #236 e re-validação; **sem tocar em outras Draft** |
| 2 | **#239** | Docs standalone; já baseada na `main` atual (`clean`); sem dependência | `git fetch`; re-rodar `pnpm test`, typecheck, lint, build; `cd mobile && pnpm test`, typecheck, `expo-doctor`; conferir CI `Required` success pós-rebase (se houver) |
| 3 | **#240** | Agora sobre a `main` pós-#236; nada de arquivo mudou; rebase para `d391782` resolvido pelo merge da #236 | Rebase/merge-base atualizado; `pnpm test`, typecheck, lint; `pnpm ci:database` não afetado (docs-only); conferir CI `Required` success |
| 4 | **#242** | Umbrella RLS telemetria; agora a `main` contém #236 (ficha) e #233 (contratos); | `pnpm ci:database` **obrigatório** (roda o umbrella `customer_360_telemetry_read.sql` nos 2 blocos do runner isolado); `pnpm test`; conferir que `scripts/ci/test-database.sh` não conflita com qualquer outra mudança futura; |
| 5 | **#244** | Fix mobile fail-closed; independente de #236/#242 (paths `mobile/**`); recomendado antes de #246 | `cd mobile && pnpm test`, `cd mobile && pnpm typecheck`; `cd mobile && pnpm dlx expo-doctor@1`; raiz: `pnpm test` (não regressão web), typecheck, lint, build; conferir CI `Mobile workspace` success |
| 6 | **#246** | Smoke pack Android pós-fix #244; doc referencia R2/R3/#244; | `node tests/android-smoke-pack-references.test.mjs` (static;; incluído em `pnpm test`); raiz `pnpm test` (falha pré-existente `tests/public-entrypoints.test.mjs` **não relacionada**, ver nota); `cd mobile && pnpm test`; conferir CI `Required` success |
| 7 | **#248** | iOS readiness; cita #246/G1–G14; último docs-pack do pipeline | `node tests/ios-readiness-references.test.mjs` (static;; incluído em `pnpm test`); `pnpm test`, typecheck, lint, build; `cd mobile && pnpm test`, typecheck, `expo-doctor`; conferir CI `Required` success |

Nota (passo 6): `tests/public-entrypoints.test.mjs` falha neste sandbox por
`ERR_MODULE_NOT_FOUND: package "typescript"` — `node_modules` raiz não instalado; a mesma
falha ocorre na base `d391782` sem os arquivos da #246; **não é regressão desta PR** e é
inexistente no CI (que instala dependências via `pnpm install --frozen-lockfile`).

Cada passo termina com **CI verde no head da PR** (`Required` ⇒ `success`) **e**
**merge one-at-a-time na `main`**, com rebase do próximo passo imediatamente após cada merge.

## 6. Verificação pós-merge (gates exatos)

Após cada merge, antes do próximo passo:

| Gate | Comando/verificação | Falha ⇒ (stop rule) |
| --- | --- | --- |
| V1 | `git fetch origin main && git rev-parse origin/main` | SHA inesperado ⇒ parar e registrar |
| V2 | GitHub Actions run no merge commit: `Application`, `Database authorization`, `Mobile workspace`, `Required` ⇒ `success` | qualquer `failure` ⇒ parar, investigar, reverter/consertar antes de prosseguir |
| V3 | Conferir que a `main` ainda preserva os contratos canônicos: `customer_id`, `created_by`, `confirm_customer_vehicle`, `register_vehicle_fuel`, `register_vehicle_charging`, `register_vehicle_maintenance`, `vehicle_expense_summary`, `createMobileServiceRequest`, L/kWh separados | qualquer contrato ausente/alterado inesperadamente ⇒ parar (fail-closed) e registrar |
| V4 | `pnpm ci:database` (suite RLS/autorização em banco isolado do runner) | qualquer teste SQL vermelho ⇒ parar e reverter |
| V5 | Rebase do próximo PR sobre a nova `main` + checks do passo correspondente (Seção 5) | conflito não resolvível de forma repository-safe ⇒ parar e registrar blocker |

## 7. Human Gates (separados; **não executados** por esta issue)

Nenhum destes é parte do merge sequencing; permanecem gates externos/humanos e
**não são acionados** por esta issue nem por nenhuma das 7 Draft PRs:

| # | Gate | Ação mínima humana | Quando |
| --- | --- | --- | --- |
| H1 | Aplicação de migrations remotas no Supabase **não-produção** | humano autorizado aplica as migrations aprovadas (#233 entre outras) no projeto não-prod usado pelo preview | após merges da Seção 5; **separado** (issue #83/#206 documentam o plano de produção/reconciliação; nada aqui) |
| H2 | Validação em dispositivo real (Android/iOS) com o schema não-prod aplicado | seguir os smoke packs #246/#248 pós-gate H1 | após H1 |
| H3 | Produção Supabase / reconciliação (`#83`) | humano responsável pelo banco reaplica/reconcilia migrations e verifica RLS/auth em produção | antes de produção real; fora do Release 1.0 pipeline repo-safe |
| H4 | Contas/credenciais Apple Developer (Team ID, App ID/bundle irreversível, signing/provisioning, TestFlight, App Store) | registradas/configuradas manualmente | distribuição iOS (Release 1.0); nenhuma ação desta issue |
| H5 | Contas/credenciais Google Play (package de produção, AAB, teste fechado, Publicação) | registradas/configuradas manualmente | distribuição Android (Release 1.0) |
| H6 | Pagamentos reais / mensagens reais (WhatsApp/n8n) | operação comercial humana; nenhum pagamento/mensagem real é enviado por nenhuma PR | fora do escopo repo-safe; nunca em Draft/CI |
| H7 | Secrets / produção / deploy | nenhum secret é acessado/rotacionado; nenhum deploy/deploy preview fora do padrão repo verificado | sempre humano e explícito |

## 8. Stop / rollback fail-closed

Regra geral: **parar e registrar o blocker exato**; jamais forçar merge, contornar
RLS, aplicar migration remota, acessar secrets, enviar pagamento/mensagem real ou
publicar App/loja como parte desta issue.

 Condições de stop:

| Condição | Ação |
| --- | --- |
| Qualquer PR fica `non-mergeable` (conflito, `behind` por mudança inesperada,, CI vermelho) | parar o passo; registrar PR, base/head SHA, paths conflitantes, CI run URL; não rebase forçada de outra Draft; não alterar o código da PR problemática a menos que causa repository-safe comprovada |
| Contrato canônico mudar inesperadamente (schema, RLS, `customer_id`, `created_by`, L/kWh,, RPC listados em V3) | parar e registrar o diff suspeito; nenhuma correção silenciosa |
| Overlap não resolvível de forma repository-safe entre Draft PRs | parar; registrar os pares e o motivo; escalar para humano |
| CI regride pós-merge (qualquer job `Required` vermelho) | parar; reverter o merge (se possível) e registrar o run ID; nenhum merge adicional |
| PR citada (#236/#239/#240/#242/#244/#246/#248) for fechada/mergeada com SHA diferente do inspecionado | re-verificar o mapa (Seção 2) antes de prosseguir; apenas docs/static check desta issue são re-validados |
| Esta issue perde o escopo repo-safe (ex.: tentativa de merge, migration remota, secret, publicação) | parar imediatamente; nenhuma ação adicional |

## . Invariantes preservados (resumo)

- Supabase/backend canônico continua a única fonte da verdade; nada de estado paralelo.
- Identidade e `customer_id` canônicos; auth provider é método de login, não identidade.

- Vehicle ownership e `service_request` canônicos (`customer_id` + `created_by`); sem inferência por nome/telefone/placa.`
- Mileage e fuel/charging (litros **e** kWh **separados**, sem conversão inventada) preservados;.`
- Expenses, maintenance, documents e RLS/auth preservados; fail-closed para source indisponível.`
- Nenhum dado sintético representado como real; nenhuma migration remota; nenhum merge executado por esta issue.
`

## Referências
- EPIC #164; auditoria de aceitação #228/#229 (mergeada em `9d6f9f8`); `#233` (mergeada em `c8692247`); `#234` (mergeada em `d391782`).
- Draft PRs inspecionadas: #236, #239, #240, #242, #244, #246, #248.
- Teste estático desta issue: `tests/release-1.0-merge-sequencing-references.test.mjs`.
- Human Gate de produção/reconciliação:`#83`; plano de produção documentado em `docs/issue-43-production-migration-plan.md`.