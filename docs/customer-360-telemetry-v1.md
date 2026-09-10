# Cliente 360° V1.1 — telemetria veicular canônica (#241)

> Fatia repository-safe de preparação. Nenhuma UI/service foi alterada nesta issue: a
> ficha Cliente V1 está inteiramente em Draft #236 (`app/(command)/clientes/**`,
> `services/customer-crm/**`, `components/customer-crm/**`, `docs/customer-crm-v1.md`,
> `tests/customer-crm.test.mjs`) e qualquer leitura administrativa de quilometragem,
> abastecimento, recarga, manutenção ou documentos colidiria 1:1 com esses
> arquivos. Por isso esta entrega limita-se a: matriz de autorização/data-contract (este
> documento), umbrella RLS de leitura isolável (`supabase/tests/customer_360_telemetry_read.sql`)
> registrado na suíte CI, e um plano de integração pós-#236. Sem schema/migration,
> sem fonte paralela, sem estado CRM alternativo.

## Escopo aceito

| # | Item | Status nesta fatia |
| - | ---- | ------------------- |
| 1 | Quilometragem atual e histórico | **#236-derivável** (leitura admin já existe em `customer_vehicles.current_mileage` e em `readCustomer` do #236); histórico `vehicle_mileage_logs` mapeado, leitura delegada ao pós-#236 |
| 2 | Abastecimentos | **Pós-#236**; contrato e autorização mapeados abaixo; testes/fixtures isolados entregues |
| 3 | Recargas EV/híbridas | **Pós-#236**; idem |
| 4 | Manutenções | **Pós-#236**; idem |
| 5 | Documentos (somente onde o contrato/autorização existente permitir) | **Pós-#236**; documento API é owner-only (não admin); só metadata `vehicle_documents` derivável se o pós-#236 e o contrato de autorização forem estendidos por issue própria; sem storage objects de terceiros |

## Fonte única da verdade

Reuso exclusivo de IDs canônicos. Nunca inferir vínculo por nome, telefone,
placa, `created_by`, `provider_id` ou qualquer campo não-id. A única ponte permitida
cliente→veículo→telemetria é:

```
customers.id  ── customer_vehicles.customer_id  ──  customer_vehicles.id
                                                          │
        vehicle_mileage_logs.vehicle_id ───────────────┤
        vehicle_fuel_logs.vehicle_id ─────────────────────┤
        vehicle_charging_logs.vehicle_id ───────────────┤
        vehicle_maintenance_records.vehicle_id ──────────┤
        vehicle_documents.vehicle_id ────────────────────┤
        vehicle_expenses.vehicle_id ───────────────────────┤
        service_requests.vehicle_id (quando `customer_id` da solicitação = id do cliente) ──┘
```

Registros legados sem `customer_id` não são reatribuídos; a ficha #236 já
documenta essa limitação. Solicitações com `vehicle_id` de outra ficha jamais entram
na projeção dessa ficha (exige `service_requests.customer_id = customer.id`
**e** `service_requests.vehicle_id` apontando para um veículo cujo
`customer_vehicles.customer_id = customer.id`).

## Matriz tabela/RPC → campo exibível → autorização → fallback fail-closed

Autorização administrativa é sempre `requireRole(["admin"])` por entrada de serviço
igualmente à #236; `concierge` preserva o portal atual e não ganha acesso novo.
Nenhuma leitura administrativa destas fontes existe hoje em serviço/UI além das
leituras de identidade/canais/veículo/solicitação aprovadas na #236. Sem nova
migration; toda a coluna "Política RLS existente" já está em `main` (após #233).

### Identidade e vínculo (já aprovadas na #236)

| Fonte canônica | Colunas projetáveis (exibível) | Autorização hoje | Política/contrato RLS existente | Fallback fail-closed |
| -------------- | ------------------------- | ---------------------------- | ------------------------------ | -------------------------- |
| `customers` | `id`, `display_name`, `created_at` | Leitura #236 `readDirectory`/`readCustomer` — `requireRole(["admin"])`, sem cache compartilhado | `20260730153004_secure_customer_identity.sql`: "Operations read customer identities" (`current_verah_role() in ('concierge','admin')`) | Fonte ausente/permissão negada/erro de transporte/count inválido ⇒ `unavailable("source")`; nunca vira 0 ou lista vazia |
| `customer_channels` | `id`, `customer_id`, `channel_type`, `channel_address`, `consent_status`; **nunca** `app channel`/auth IDs | Leitura #236 contato/pesquisa — `requireRole(["admin"])` | "Operations read customer channels" (`in ('concierge','admin')`) | Contato indisponível restringe busca a nome com aviso explícito; sem contato, nenhuma derivação de identidade |
| `customer_vehicles` | `id`, `customer_id`, `brand`, `model`, `year`, `plate`, `nickname`, `current_mileage` (quilometragem atual), `active` | Leitura #236 `readCustomer`/`readMetrics` — `requireRole(["admin"])` | `20260802013920_alpha_intelligent_intake_foundation.sql`: "Customers and admins read customer vehicles" (`customer` própria ou `in ('concierge','admin')`) | Veículo inativo continua na contagem de `readMetrics` (documentado na #236); sem `current_mileage` não se deriva valor |

### Telemetria veicular canônica (contratos #233 já em `main`)

| Fonte | Colunas exibíveis (somente read-only) | Grupo de leituras (RPC/query PostgREST) | Autorização alvo | Política RLS existente | Append-only/grants | Fallback fail-closed |
| ------ | -------------------------------- | -------------------------------------- | ------------------------ | ------------------------------ | --------------------------- | ------------------- |
| `vehicle_mileage_logs` | `id`, `vehicle_id`, `recorded_at`, `mileage_value`, `note`, `created_at` (sem `created_by` na ficha) | histórico por `vehicle_id` ordenado `recorded_at desc, created_at desc`; `readRows` com páginas 200/lote 50 (mesmo mecanismo #236); limite V1 5.000 | `requireRole(["admin"])` somente após binding canônico cliente→veículo | `20260907000000_vehicle_mileage_logs.sql`: "Customers read own vehicle mileage logs" (proprietário/ativo) + "Admins read vehicle mileage logs" (`= 'admin'`) | `grant select` só; RPC `register_vehicle_mileage` só para `authenticated`; trigger imutável `reject_vehicle_mileage_log_mutation` | Fonte ausente/erro/count nulo/inválido ⇒ `unavailable("source"|"invalid")`; nunca 0 parcial |
| `vehicle_fuel_logs` | `id`, `vehicle_id`, `recorded_at`, `odometer_value`, `liters`, `total_amount`, `fuel_type`, `consumption_kmpl`, `note`, `created_at` | idem; consumo por km **derivado determinístico** no contrato (não recalcular no cliente) | `requireRole(["admin"])` | `20260907120000_vehicle_fuel_logs.sql`: "Customers read own vehicle fuel logs" + "Admins read vehicle fuel logs" (`= 'admin'`) | `grant select` só; `register_vehicle_fuel` só `authenticated`; trigger imutável `reject_vehicle_fuel_log_mutation` | idem |
| `vehicle_charging_logs` | `id`, `vehicle_id`, `recorded_at`, `odometer_value`, `kwh`, `total_amount`, `battery_percent`, `charging_type`, `consumption_km_kwh`, `note`, `created_at` | idem; eV/híbrido somente quando `customer_vehicles.engine` indicar elétrico/híbrido na ficha; sem tabela paralela | `requireRole(["admin"])` | `20260910000000_vehicle_charging_logs.sql`: "Customers read own vehicle charging logs" + "Admins read vehicle charging logs" (`= 'admin'`) | `grant select` só; `register_vehicle_charging` só `authenticated`; trigger imutável compartilhado `reject_vehicle_mileage_log_mutation` | idem |
| `vehicle_maintenance_records` | `id`, `vehicle_id`, `maintenance_type`, `description`, `occurred_on`, `odometer_km`, `amount_cents`, `next_due_on`, `next_due_km`, `created_at` (sem `owner_id`/`customer_id` na ficha) | idem por `vehicle_id` | `requireRole(["admin"])` | `20260909005541_vehicle_maintenance_records.sql`: "Customers read own maintenance" (owner+ativo+`v.customer_id`=registro) — **sem política admin**; leitura admin **bloqueada por RLS hoje** | `grant select` só; `register_vehicle_maintenance` só `authenticated`; trigger imutável comum | **Fail-closed**: sem política admin, admin lê 0 linhas (RLS); deve ser registrado como `unavailable`/explicitado no pós-#236, jamais contornado por SECURITY DEFINER ou by pass de RLS |
| `vehicle_expenses` | `id`, `vehicle_id`, `category`, `description`, `amount_cents`, `occurred_on`, `odometer_km`, `created_at` (custo-por-km `vehicle_expense_summary` é invoker; **sem política admin**) | resumo via `vehicle_expense_summary(p_vehicle_id, ...)` somente do dono (RLS invoker) | `requireRole(["admin"])` **não autoriza hoje** | `20260908000000_vehicle_expenses_dashboard.sql`: "Customers read own vehicle expenses" (owner), updates/deletes owner; RPC `vehicle_expense_summary` security invoker | `grant select,insert,update,delete` para `authenticated`; mutações protegidas por RLS; despesas de manutenção imutáveis por trigger `protect_maintenance_expense` | **Fail-closed**: fora do escopo V1.1 de leitura admin; manter fora ou estender por issue própria com política própria |
| `vehicle_documents` | **metadata read-only somente com autorização específica**: `id`, `vehicle_id`, `document_kind`, `document_date`, `reference`, `note`, `file_name`, `mime_type`, `size_bytes`, `status`, `created_at` (sem `storage_path`/`storage_bucket` na ficha; **sem objetos storage**) | listagem de metadata do dono; nenhuma leitura admin | `requireRole(["admin"])` **não autoriza hoje** | `20260909120000_vehicle_documents.sql`: "Owners read active vehicle documents" (owner+status active+veículo ativo) + políticas `storage.objects` owner-only; **sem política admin** | `grant select` só; RPCs só `authenticated`; trigger `protect_vehicle_document_mutation` | **Fail-closed**: metadata admin fica **bloqueada por RLS hoje**; exibição só "quando o contrato/autorização existente permitir" — exigir policy própria em issue dedicada; jamais listar storage de outro dono |
| `service_requests` (histórico de atendimento da ficha) | `id`, `reference_code`, `customer_id`, `vehicle_id`, `service_stage`, `created_at`, `updated_at` (somente projeção #236 `readCustomer`) | leitura #236 `readCustomer` por ficha; vínculo por `customer_id` exato + `vehicle_id` do mesmo dono | `requireRole(["admin"])` já aprovado | `20260802013920_alpha_intelligent_intake_foundation.sql` "Role scoped service request access" (`in ('concierge','admin')` etc.) + `grant select` colunas restritas | RLS | mesma regra da #236: sem evento não derivar contato humano; falhas por fonte ⇒ `unavailable` |

## O que já é derivável hoje vs. o que depende de ambiente remoto/migrations aplicadas

| Derivável hoje (repository-only) | Dependente de ambiente remoto/migrações #233 aplicadas |
| ------------------------------------ | ----------------------------------------------- |
| Matriz de autorização/data-contract acima | Qualquer **validação de dados reais** das tabelas de telemetria (mileage/fuel/charging/maintenance/documents/expenses) e leitura administrativa efetiva: exige banco com as migrations #233 aplicadas (`20260907000000_vehicle_mileage_logs.sql`, `20260907120000_vehicle_fuel_logs.sql`, `20260908000000_vehicle_expenses_dashboard.sql`, `20260909005541_vehicle_maintenance_records.sql`, `20260909120000_vehicle_documents.sql`, `20260910000000_vehicle_charging_logs.sql`) |
| Umbrella RLS read-only desta issue (roda na suíte `scripts/ci/test-database.sh` em banco isolado do runner, sem tocar backend da aplicação) | — |
| Contratos/fixtures de leitura isoláveis | — |

As migrations #233 **já estão válidadas em CI isolado** (audit #228/#229, block 2
da tabela do passeio) e nenhuma nova migration é criada aqui. A única razão de
"depende de ambiente" é a presença/estado real do banco remoto — **Human Gate** abaixo.



## Human Gate (exato)

> **Gate**: validar lecturas administrativas de quilometragem, abastecimento, recarga,
> manutenção ou documentos contra **dados reais** exige um banco com as migrations #233
> aplicadas e políticas vigentes. Aplicar migrations remotas (`supabase db push`,
> migration repair/reconciliation) ou criar política RLS nova **não faz parte desta issue**
> e não será executado. Registrar: para validar dados reais da #241 é necessário
> aplicar as migrations #233 no ambiente autorizado pelo humano responsável pelo
> banco (Human Gate) — fora do escopo do agente/PR. Nenhuma ação de banco remoto
> foi executada nesta entrega.

## Integração pós-#236

Quando #236 mergear (ficha Cliente V1 com `readCustomer`, `readRows`, `available/unavailable`), a leitura de telemetria entra como próximas fatias sem tocar os contratos:

1. **Continuar o binding canônico**: `readCustomer` já projeta `customer_vehicles`  por `customer_id`; telemetria deve ser lida **por `vehicle_id`** com `readRows` (pages 200 / lotes 50 / limite 5.000) — nunca re-ler `customers` ou inferir vínculo.
2. **Autorização**: cada fonte telemetria com entrada própria `requireRole(["admin"])`; mesma semântica de `unavailable` por fonte; falha de uma fonte não derruba a ficha.
3. **Manutenção e despesas**: **sem política admin hoje** — antes de exibir, abrir issue dedicada para política RLS admin (não SECURITY DEFINER, não by pass) ou exibir somente `customer_vehicles.current_mileage` e logs com política admin já existente (mileage/fuel/charging)
4. **Documentos**: metadata `vehicle_documents` sem política admin; exibir somente com issue própria estendendo o contrato de autorização; **jamais** expor `storage.objects` de terceiros
5. **Ordem**: quilometragem atual (já #236) → histórico mileage/fuel/charging (política admin existente) → manutenção/expenses/documentos (após política própria); cada fatia com seu umbrella test.
Leva-e-traz/custódia permanece com os gates existentes da #233; nada desta issue enfraquece custody flows.

## Proibido (reafirmação)

Nenhum banco remoto, `db push`, migration repair/reconciliation, secrets, produção/deploy,
mensagens/pagamentos reais, App ID/signing/submission/publicação ou merge automático.
 Nenhuma fonte paralela de CRM/telemetria, nenhuma identidade/veículo por nome/telefone/placa/created_by, nem contorno de RLS. O teste entregue usa somente o banco isolado do runner (caminho `ci:database` da cânonica CI#228/#229).

## Validação desta fatia

- `supabase/tests/customer_360_telemetry_read.sql`: lê  isoladamente com PostgREST/RLS (sem tocar arquivos da #236); cobre  binding canônico, isolamento cliente/veículo e fonte indisponível (todos os cenários executáveis sem UI/service).
- Registrado em `scripts/ci/test-database.sh` ao lado dos demais testes de telemetria (bloco 1 e bloco 2).
- Documentação/contrato: este arquivo.
 Sem mudança de código de aplicação. `pnpm ci:application` segue verde por construção (nenhum arquivo TS/mobile alterado), o que será confirmado no CI da Draft PR.