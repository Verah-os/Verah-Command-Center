# Release 1.0 — Web × Mobile parity audit

Data: 2026-09-13
Fonte: ADR `docs/architecture/decisions/010-web-mobile-parity.md`

VERAH é um produto multichannel. Esta auditoria consolida a baseline de paridade
Web × Mobile do Release 1.0, provando que Web e Mobile consomem os mesmos
registros canônicos (mesmas tabelas, RPCs e RLS do Supabase) para cada
capacidade oferecida ao cliente.

## Método

- Backend canônico: identificado pelo contrato versionado (`supabase/migrations`
  + `supabase/tests/*`).
- Web: rota/UI sob `/demo/cliente*` e services sob `services/*`.
- Mobile: facade/controller sob `mobile/src/**`.
- Consistência cross-channel: mesmo RPC/argumento ou mesma tabela/RLS usada nos
  dois canais, com bounds de validação idênticos.
- Teste: cobertura nas suítes web (`tests/*`), mobile (`mobile/tests/*`) e
  segurança de banco (`supabase/tests/*`).

## Resultado

| Capability | Backend | Web | Mobile | Cross-channel | Teste | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Authentication/login | auth canônico | `/login` | AuthGate | mesma identidade Supabase | auth-session (mobile) + web | PASS |
| Onboarding/profile | RPCs onboarding | `/onboarding/cliente` | OnboardingStep | mesmos RPCs | onboarding security | PASS |
| Customer identity | `customers` + auth | gate cliente | AuthGate | mesmo customer | identity security | PASS |
| Garage | `customer_vehicles` | home/veiculos | CustomerHome | mesmas linhas | vehicle onboarding security | PASS |
| Veículo create/edit/deactivate | RPCs confirm/replace | onboarding/vehicle form | VehicleOnboardingStep | mesmos veículos | vehicle security | PASS |
| Vehicle ownership | RLS owner-based | filtro owner server-side | leitura owner-scoped | mesma fronteira RLS | RLS catalog | PASS |
| Vehicle history | tabelas canônicas | veículo/histórico | CustomerJourney | mesmas linhas | history | PASS |
| Mileage/odometer | `register_vehicle_mileage` | `/veiculo/[id]/mileage` | MileageScreen | mesmo RPC | mileage security + contract | PASS |
| Fuel/refueling | `register_vehicle_fuel` | `/veiculo/[id]/fuel` | FuelScreen | mesmo RPC | fuel security + contract | PASS |
| EV/charging | `register_vehicle_charging` | `/veiculo/[id]/fuel` | ChargingScreen | mesmo RPC, kWh | charging security + contract | PASS |
| Expenses | `vehicle_expenses` + summary | `/veiculo/[id]/expenses` | dashboard leitura / write via maintenance | ESTRUTURA canônica (ver GAP) | expenses security | PASS com ressalva = GAP parcial |
| Maintenance | `register_vehicle_maintenance` | `/veiculo/[id]/maintenance` | MaintenanceScreen | mesmo RPC + idempotência | maintenance security + contract | PASS |
| Maintenance assistance | manutenção + reminders | reminder na página | reminder cards | mesma derivação | maintenance-assist (mobile) | PASS |
| Documents | `vehicle_documents` + storage privado | `/veiculo/[id]/documents` | VehicleDocumentsScreen | mesmos RPCs + bucket privado | documents security + contract | PASS |
| service_request | canônico | `/novo-atendimento` | CustomerRequests | mesmo estado | service-request | PASS |
| Customer service journey | estágios canônicos | `/atendimento/[id]` | CustomerJourney | mesma state machine | journey tests | PASS |
| Concierge interaction | estado canônico | `/demo/concierge` | app concierge | mesmo estado | concierge auth tests | PASS |
| Provider interaction | estado canônico | `/demo/prestador` | app provider | mesmo estado | provider tests | PASS |
| Dashboard/home | projeção canônica | `/demo/cliente` | CustomerHome | mesma projeção | customer-360 | PASS |
| Reminders/next-care R1 | derivação canônica | nextCareMessages web | maintenance reminders | mesma entrada | next-care + assist | PASS |
| Câmera/fotos | — | picker de arquivo (upload) | image picker/câmera | mesmo RPC de documento | documents tests | INTENTIONAL PLATFORM-SPECIFIC |
| Push notifications | n8n contracts | feedback in-app | Expo notifications | mesmo contrato backend | n8n SLA security | INTENTIONAL PLATFORM-SPECIFIC |

## GAPs identificados e tratados

### GAP-1 (histórico): despesas manuais no Mobile

Antes desta auditoria, a Web não possuía telas de veiculo-log (M2). O ponto mais
relevante: **Mobile escrevia despesas somente pelo caminho
`register_vehicle_maintenance` com `create_expense = true`**; a Web não tinha
navegação/forms para quilometragem, combustível, recarga, manutenção, despesas e
documentos.

**Tratamento aplicado (repository-safe):**

- Web agora expõe navegação e páginas de registro/consulta para
  quilometragem, combustível/recarga, manutenção, despesas e documentos sob
  `/demo/cliente/veiculo/[id]/*`.
- Web usa exatamente os mesmos RPCs canônicos que o Mobile
  (`register_vehicle_mileage|fuel|charging|maintenance`, `register_vehicle_document`,
  `remove_vehicle_document`, `vehicle_expense_summary`).
- Web lê as mesmas tabelas canônicas sob a mesma RLS.
- Validação de bounds compartilhada em `lib/customer-vehicle-log-contract.ts`,
  espelhando o controller mobile, com testes cross-channel em
  `tests/customer-vehicle-log-contract.test.mjs`.
- Idempotência de documento reusa a mesma chave determinística do Mobile
  (`vehicle-document:kind:date:filename:size`); manutenção reusa a mesma chave
  (`maintenance:vehicle:type:date:km`).

**Ressalva de plataforma:** a Web pode criar despesa manual via INSERT em
`vehicle_expenses` (autorizado pela RLS/venda do contrato em #215). O Mobile não
tem um form de despesa manual — cria despesas apenas via manutenção. Isso NÃO é
duplicação de domínio; é a mesma tabela/RLS. Fica documentado como melhoria
opcional de UI Mobile (fora do escopo repository-safe atual).

## Validado nesta auditoria

- `pnpm test` web 354/354 verde.
- `pnpm typecheck` web verde.
- `pnpm lint` web zero warnings.
- `pnpm build` web verde; rotas de veiculo-log renderizam.
- Mobile: `pnpm test` 87/87 verde; `pnpm typecheck` verde.
- CI de aplicação (`pnpm ci:application`) verde.
- CI de banco (Docker) indisponível no sandbox: rodada localmente apenas
  depois do Human Gate de staging (não bloquear o código em si; ver master plan).

## Gate humano real

Nenhum gate humano novo é introduzido por esta auditoria. Permanece o gate já
conhecido de **aplicação das migrations do Supabase não-produtivo** quando o
release precisar validar funcionamento ponta-a-ponta com banco real.