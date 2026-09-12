# Release 1.0 — Staging migrations runbook (Issue #252)

Data: 2026-09-11. Base: `main` em `d391782` (2026-09-10).
Escopo: documento repository-safe da sequência exata de migrations canônicas,
dependências, invariantes e checklist de aplicação/validação para projeto
Supabase **staging/Alpha separado**. Produção permanece intocada.
Atualização (PR #262): `20260912131500_staging_advisor_security_hardening`
(endurecimento #259) é a 54ª migration versionada, **repository-only pendente** —
presente no repositório, **não** aplicada ao staging até o Human Gate
(ver `release-1.0-staging-advisor-audit.md` e `PENDING_REPOSITORY_VERSIONS`
em `tests/staging-migrations-sequence.test.mjs`).



## 1. Objetivo e proibições

Objetivo: reproduzir no staging o backend do Release 1.0 (identidade, autenticação,
onboarding, garagem, `service_request`, telemetria veicular de mileage/fuel/
maintenance/expenses/charging/documents), aplicando **somente** as migrations
versão das ao repositório — sem inventar arquivos, IDs ou schema paralelo.



Proibido nesta issue e até o Human Gate de staging:

- Produção DB (qualquer leitura/escrita).
- `supabase db push` remoto, `migration repair`/`reset`/reconcile.
x
- Secrets (supabase access token, service_role, `SUPABASE_DB_PASSWORD`, etc.)
  em commits, logs ou comentários.

- Pagamentos, mensagens reais, App IDs, signing, TestFlight/App Store/Google Play.


- Merge automático.

Remote Supabase access/application/repair/reset/reconciliation não são
executados por esta issue.



## 2. Sequência canônica exata — 53 migrations provenientes de `main`

A ordem abaixo é **derivada dos timestamps/versões reais dos nomes de arquivo**
em `supabase/migrations/` no `main` atual (`d391782`), na ordem que o Supabase
CLI aplica (ordem lexicográfica das versões de 14 dígitos). Conferida pelo teste
estático `tests/staging-migrations-sequence.test.mjs` (sequência congelada; ao
avançar a sequência, atualizar o teste **e** este runbook explicitamente, uma vez).

| # | Versão | Migration | Cobertura (Release 1.0 |
| ---: | --- | --- | --- |
| 1 | `20260709050000` | `create_work_orders` | legado work_order |
| 2 | `20260709053000` | `create_dispatcher_jobs` | dispatcher (legado) |
| 3 | `20260709060000` | `create_dispatcher_pipeline` | dispatcher (legado) |
| 4 | `20260709063000` | `allow_work_order_creation` | RLS work_order |
| 5 | `20260709070000` | `fix_work_order_insert_rls` | RLS work_order fix |
| 6 | `20260709071000` | `ensure_dispatcher_jobs_pipeline` | dispatcher garantia |
| 7 | `20260709073000` | `create_ai_agents` | registry de agentes |
| 8 | `20260709080000` | `dispatcher_engine_runtime_fields` | dispatcher runtime |
| 9 | `20260709083000` | `dispatcher_agent_selection_rules` | dispatcher seleção |
| 10 | `20260709090000` | `dispatcher_execution_controls` | dispatcher controle |
| 11 | `20260709093000` | `create_system_settings` | settings |
| 12 | `20260711010000` | `dispatcher_ai_runtime_completion` | dispatcher AI runtime |
| 13 | `20260712000000` | `create_service_requests` | **canônico `service_requests`** |
| 14 | `20260712033000` | `create_concierge_acceptance` | aceitação concierge |
| 15 | `20260712043000` | `create_service_providers` | rede de prestadores |
| 16 | `20260712053000` | `create_service_quotes` | orçamentos |
| 17 | `20260712190000` | `quote_integrity_clarity` | integridade de orçamentos |
| 18 | `20260712200000` | `complete_service_journey` | jornada de serviço |
| 19 | `20260712210000` | `create_user_profiles` | perfis de usuário |
| 20 | `20260712220000` | `secure_provider_actions` | RLS prestador |
| 21 | `20260713000000` | `add_service_request_state` | estado de serviço |
| 22 | `20260714000000` | `customer_answers_provider_reassignment` | respostas/reamostra |
| 23 | `20260714010000` | `fix_triage_providers_insurance` | triagem/seguro |
| 24 | `20260715000000` | `concierge_lifecycle` | lifecycle concierge |
| 25 | `20260716000000` | `create_customer_vehicles` | **canônico `customer_vehicles`** + RLS owner |
| 26 | `20260727225432` | `secure_admin_authorization` | autorização admin |
| 27 | `20260730150101` | `customer_identity_foundation` | **canônico `customers`/`customer_channels`** |
| 28 | `20260730153004` | `secure_customer_identity` | RLS identidade |
| 29 | `20260731022348` | `alpha_communication_intake_foundation` | anexos/intake comunicação |
| 30 | `20260731225632` | `control_plane_001_dry_run` | control-plane dry-run |
| 31 | `20260802013920` | `alpha_intelligent_intake_foundation` | intake inteligente |
| 32 | `20260802035514` | `quote_intelligence_core` | inteligência de orçamentos |
| 33 | `20260803010500` | `quote_quality_comparison` | comparação de qualidade |
| 34 | `20260805090000` | `second_opinion_vehicle_movement` | segunda opinião/movimento |
| 35 | `20260819192003` | `multiple_provider_invitations` | convites múltiplos |
| 36 | `20260820025044` | `whatsapp_worker_media` | mídia WhatsApp |
| 37 | `20260820032446` | `n8n_notifications_sla` |notificações/SLA |
| 38 | `20260826143726` | `pilot_alpha_custody_foundation` | custódia/leva-e-traz |
| 39 | `20260826150710` | `provider_homologation_foundation` | homologação de prestador |
| 40 | `20260826193000` | `whatsapp_production_readiness` | readiness WhatsApp |
| 41 | `20260827013000` | `identity_onboarding_foundation` | **canônico `verah_identities`/onboarding** |
| 42 | `20260827040000` | `vehicle_onboarding` | **proveniência canônica de veículo** (RPC-only create) |
| 43 | `20260904022000` | `service_request_pickup_location` | pickup de localização em `service_requests` |
| 44 | `20260905001000` | `canonical_service_request_customer_identity` | **binding `customer_id` canônico em `service_requests`** |
| 45 | `20260905210500` | `secure_concierge_service_lifecycle` | autorização RPC concierge |
| 46 | `20260905231000` | `converge_dispatcher_control_plane_authorization` | convergência autorização dispatcher |
| 47 | `20260907000000` | `vehicle_mileage_logs` | **telemetria — mileage** (append-only, sem kWh) |
| 48 | `20260907120000` | `vehicle_fuel_logs` | **telemetria — fuel (litros/km/L)** |
| 49 | `20260907141500` | `vehicle_replacement_preserving_history` | troca segura preservando histórico |
| 50 | `20260908000000` | `vehicle_expenses_dashboard` | **telemetria — expenses/custo por km** |
| 51 | `20260909005541` | `vehicle_maintenance_records` | **telemetria — maintenance** (append-only, linka expense) |
| 52 | `20260909120000` | `vehicle_documents` | documentos/notas por veículo |
| 53 | `20260910000000` | `vehicle_charging_logs` | **telemetria — EV charging (kWh/km-kWh)** |

Nota: `20260910000000_vehicle_charging_logs` (charging) foi adicionada depois da última
auditoria de readiness de 2026-09-09(que listava 52 migrations); o `main` atual
tem **53** migrations **aplicadas no staging**. A PR #262 adiciona uma 54ª migration
versionada, `20260912131500_staging_advisor_security_hardening` (endurecimento #259),
classificada como **repository-only pendente** (ver `PENDING_REPOSITORY_VERSIONS` no
teste de sequência): permanece no repositório mas **não integra a contagem aplicada**
no staging até o Human Gate. A contagem esperada de migrations aplicadas no staging
após este runbook é portanto **53** — conferida por
`select count(*) from supabase_migrations.schema_migrations;`.

## 3. Cobertura das milestones exigidas pela issue

| Domínio | Migrations | Unidade | Invariante-chave |
| --- | --- | --- | --- |
| Milhas (`mileage`) | 47 | `mileage_value integer` | odômetro nunca regride; append-only |
| Combustível (`fuel`) | 48 | `liters numeric(10,3)` + `consumption_kmpl numeric(8,2)` | litros, km/L; sem kWh |
| Manutenção (`maintenance`) | 51 | `vehicle_maintenance_records` + `maintenance_record_id` em expenses | append-only; link de expense infalsificável |
| Recarga EV (`charging`) | 53 | `kwh numeric(10,3)` + `consumption_km_kwh numeric(8,3)` | kWh, km/kWh; sem litros; não-regressão cruzada c/ fuel+mileage |
| Despesas/custo por km | 50 | `amount_cents integer` + `odometer_km` | owner/customer/vehicle canônicos; custo derivado só c/ base válida |
| Documentos/notas | 52 | `vehicle_documents` | append-only lógico (status `removed`), bucket privado owner-scoped |



## 4. Dependências e riscos conhecidos

Dependências (todas satisfeitas pela ordem da §2):

1. **`customer_vehicles` (#25) é o registro canônico de veículo** e FK de todas as
   tabelas de telemetria (`vehicle_mileage_logs`, `vehicle_fuel_logs`,
   `vehicle_charging_logs`, `vehicle_expenses`, `vehicle_maintenance_records`, `vehicle_documents`;
   todas `references public.customer_vehicles(id)`).
2. **`vehicle_fuel_logs` (#48) e `vehicle_mileage_logs` (#47) precedem
   `vehicle_charging_logs` (#53)**: o RPC de charging calcula a não-regressão
   considerando `vehicle_charging_logs`, `vehicle_fuel_logs` e
   `vehicle_mileage_logs`, além de `customer_vehicles.current_mileage`.
3. **`vehicle_expenses` (#50) precede `vehicle_maintenance_records` (#51)**: a
   migration de maintenance adiciona `maintenance_record_id uuid` a
   `vehicle_expenses` e instala o trigger `protect_maintenance_expense`(imutabilidade
   de despesas vinculadas a manutenção).
4. **`vehicle_mileage_logs` (#47) define `private.reject_vehicle_mileage_log_mutation()`**:
   esse guarda é reutilizado pelos triggers append-only de
   `vehicle_maintenance_records` (#51) e `vehicle_charging_logs` (#53)
   (o fuel define guarda próprio, `reject_vehicle_fuel_log_mutation()`).
5. **`service_requests` (#13) é o canônico**; as migrations #43 (pickup) e
   #44 (bind de `customer_id`) alteram a mesma tabela e dependem da #13.
6. **`customers` (#27) e `verah_identities` (#41)** precedem o binding de
   `service_requests.customer_id` (#44) e a proveniência de veículos (#42);
    auth continua sendo método de login, não identidade (`customers.auth_user_id` único, sem duplicidade).
7. **`vehicle_onboarding` (#42) altera `customer_vehicles`** (proveniência `data_source`, `lookup_source`) e torna creation RPC-only (`confirm_customer_vehicle`) — deve rodar depois da #25; insere direto é revogado de `authenticated`.
8. **Migrations de endurecimento (#26, #28, #45, #46, and sequência)** dependem
   das tabelas/funções que endurecem e estão todas após os alvos.



Riscos conhecidos:

- **`vehicle_expenses`** mantém grants `update`/`delete` para `authenticated` (CRUD
  manual de despesas) — risco deliberado, mitigado para despesas vinculadas a
  manutenção pelo trigger imutável `protect_maintenance_expense`.
 Verificar na
  validação (pós-aplicação) que despesas vinculadas a manutenção rejeitam update/delete.

- **Domínios de energia separados**: fuel não possui coluna `kwh`; charging não
  possui coluna `liters`; consumo derivado é determinístico (consumption_kmpl /
  consumption_km_kwh) somente quando há intervalo de odômetro válido; nunca
  conversão fake kWh↔litros.

- **Não-regressão**: mileage rejeita `mileage < max(logs, current_mileage)`;
  fuel rejeita `odometer < max(fuel_logs.odometer_value)``; charging rejeita
  `odometer < max(charging, fuel, mileage logs, current_mileage)``.


- **Idempotência**: todas as tabelas de telemetria possuem `idempotency_key` única
  (replays seguros; colisão com payload diferente é rejeitada com `23505`)..
- **`vehicle_replacement_preserving_history`** (#49`: desativa veículo preservando
  histórico; nenhuma exfiltração entre identidades (`owner_id = auth.uid()` +
  `customer_id = current_customer_id()` exigidos em `replace_customer_vehicle`)..
- **`vehicle_documents`** usa bucket de storage privado (`vehicle-documents`) —
  o storage precisa estar disponível no projeto staging (não há dados; apenas objeto config).
- **Locks/duração**: aplicação de 53 migrations em staging vazio é rápida
  (prova: CI local de database aplica todas desde zero em segundos); janela
  observada exigida pelo Human Gate de staging com backup анteс.



## 5. Invariantes VERAH — checklist de validação pós-aplicação

Markdown de verificação (consultar no staging somente-leitura após o Human Gate de
aplicação; **nenhuma query de escrita**):

**Identidade/ownership:**

- [ ] `customers.auth_user_id` tem índice único; `verah_identities` populado e
  ligado a `user_profiles.identity_id` (trigger `assign_user_profile_identity`).
- [ ] `customer_vehicles.owner_id`/`customer_id` presentes; policies owner-based:
  leitura/atualização dependem de `vehicle.owner_id = (select auth.uid())`.
- [ ] Insert direto em `customer_vehicles` revogado de `authenticated`; criação é RPC-only
  (`confirm_customer_vehicle`).
- [ ] `service_requests` canônico: criação com `created_by = auth.uid()` e
  `service_stage = 'solicitado'` via policy; `customer_id` ligado por trigger
  (`bind_service_request_customer_identity`) ao `customers` canônico do `created_by`.

**RLS/ownership:**

- [ ] RLS habilitada em: `customer_vehicles`, `service_requests`, `customers`,
  `verah_identities`, `vehicle_mileage_logs`, `vehicle_fuel_logs`,
  `vehicle_charging_logs`, `vehicle_expenses`, `vehicle_maintenance_records`,
  `vehicle_documents`.
- [ ] Policies de leitura de telemetria: clientes enxergam somente vehicles próprios
  (`vehicle.owner_id = (select auth.uid())` e `vehicle.active`); admin enxerga via
  `current_verah_role() = 'admin'`.
- [ ] Grants mínimos: `revoke all ... from public, anon, authenticated`` +
  `grant select` (e inserts/updates explícitos somente onde o contrato exige).

**Append-only:**

- [ ] Triggers `before update or delete` presentes e elevando exceção em:
  `vehicle_mileage_logs` (`reject_vehicle_mileage_log_mutation`),
  `vehicle_fuel_logs` (`reject_vehicle_fuel_log_mutation`),
  `vehicle_charging_logs` (usa guarda de mileage),
  `vehicle_maintenance_records` (usa guarda de mileage).
- [ ] Despesas vinculadas a manutenção (`maintenance_record_id` not null) imutáveis
  via `protect_maintenance_expense`.

**Mileage não regressivo:**

- [ ] `register_vehicle_mileage` rejeita `p_mileage < greatest(max(logs_mileage),
  `customer_vehicles.current_mileage`)` com `23514`.

**Litros vs kWh (separação de unidades):

- [ ] `vehicle_fuel_logs.liters numeric(10,3)` + `consumption_kmpl numeric(8,2)`;
  `fuel_type in ('gasolina','etanol','diesel','gnv')`.
- [ ] `vehicle_charging_logs.kwh numeric(10,3)` + `consumption_km_kwh numeric(8,3)`;
  `charging_type in ('recarga_domestica','recarga_publica','recarga_rapida','outro')`.
- [ ] Nenhuma coluna `liters` em charging; nenhuma coluna `kwh` em fuel.



## 6. Checklist de aplicação no staging separado

**Conta/apontamentos para o operador (Human Gate):**

1. Referência do projeto staging/Alpha e credencial temporária de menor privilégio,
   fornecidas por canal seguro; nunca em commits ou logs.
2. Supabase CLI na versão validada pela CI (ver `docs/issue-43-production-migration-plan.md`;
   mudança de versão exige revalidação..
3. Desabilitar deploy automático do staging (GitHub Integration → Deploy to production,
   Vercel auto-deploy, qualquer CI escrita), e garantir `--include-all` proibido.


**Pré-flight repository-safe (executar agora, sem tocar staging):**

- [ ] `git fetch origin && git rev-parse HEAD` == `d391782` (base deste runbook;
   qualquer commit novo reavalia a sequência e a recongela).
- [ ] `pnpm test` (os testes, incluindo `tests/staging-migrations-sequence.test.mjs`; verde.
- [ ] `pnpm typecheck && pnpm lint && pnpm build` (verde).
- [ ] `pnpm ci:database` quando CLI Supabase/Docker local disponível (CI local de database;
   aplica todos os arquivos do repositório desde zero em container isolado + suíte SQL;
   inclui a 54ª `20260912131500_staging_advisor_security_hardening` repository-only).



**Pré-aplicação (staging, somente leitura;saber parar:**

1. `supabase link --project-ref <STAGING_REF>` (canal seguro).
2. `supabase migration list --linked` — comparar o histórico remoto com a tabela da §2.
3. Contar `supabase_migrations.schema_migrations` no staging e listar versões
   divergentes; qualquer drift = **STOP**; não usar `migration repair`; documentar
   a divergência e escalar (a estratégia reconciliation da
   `docs/runbooks/supabase-reconciliation-manifest.md` aplica-se ao staging também).
4. `supabase db push --dry-run` — a proposta deve listar **exatamente** o delta
   entre o histórico remoto e as 53 versões aplicadas deste runbook (sem migrations
   extras nem arquivos inventados). Se listar a 54ª
   `20260912131500_staging_advisor_security_hardening`, ela é **repository-only
   pendente** (Human Gate de staging ainda aberto): **STOP** e não aplicar; ver
   `release-1.0-staging-advisor-audit.md`.

**Aplicação:**

5. Backup: PITR confirmado ou dump lógico criptografado com checksum e restore
   test aprovado (antes da janela).
6. `supabase db push` (aplicação normal de migrations; sem `--include-all`,
   sem SQL manual, sem repair..
7. Registrar janela/início-fim; após apply, conferir contagem = 53.

**Validação pós-aplicação:**

8. `supabase db lint --linked --schema public,private --level warning --fail-on error`.
9. Checklist completo da §5 (invariantes VERAH).
10. Em caso de drift crítico: restaurar do backup; nunca `migration repair` automático;
    registrar reversão sempre via nova migration revisada (conforme §9 do
    `docs/issue-43-production-migration-plan.md`.

**Human Gate mínimo para staging (separado de produção):**

- Confirmação explícita (fora deste automação) da referência do projeto staging/Alpha
  e da credencial de operação por canal seguro;
- Backup restaurável + janela observada + responsável por rollback;
- Desabilitado deploy automático/Database push de produção e de staging a partir
  de CI (verificado antes da aplicação).


## 7. Evidência repository-safe executada nesta issue

| Check | Comando | Resultado |
| --- | --- | --- |
| Teste estático focado (novo, #252) | `node --experimental-strip-types --test tests/staging-migrations-sequence.test.mjs` | 8/8 pass |
| Suíte Node completa | `pnpm test` | 292/292 pass |
| Typecheck | `pnpm typecheck` | pass |
| Lint | `pnpm lint` | pass (1 warning pré-existente em `app/demo/prestador/atendimento/[id]/page.tsx` — import `Wrench` não usado; não relacionado a #252) |
| Build | `pnpm build` | pass |
| Banco (CI local isolada) | `pnpm ci:database` | **não executado neste executor** — CLI Supabase ausente e daemon Docker indisponível; rodar no gate de staging conforme §6 |

Nota: `next-env.d.ts`/`tsconfig.tsbuildinfo` foram regenerados localmente pelo build
e **não** fazem parte deste PR (revertidos; apenas os 2 arquivos novos abaixo).

**Nenhuma ação remota foi executada** nesta issue: sem acesso a staging/Alpha,
sem produção, sem `db push`, `migration repair`, `reset`, reconciliation, sem secrets,
sem pagamentos/mensagens reais, sem signing/publicação e sem merge automático.