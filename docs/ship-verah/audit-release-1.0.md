# Auditoria obrigatória — SHIP VERAH Release 1.0 (Issue #164)

Data: 2026-09-01. Base original: `main` em `4245ba6` (#162); revisada em
2026-09-01 para `main` em `7f0b987`, com o onboarding canônico de veículo
(#139) já mergeado.
Método: auditoria baseada em evidências do código (migrations, serviços, rotas,
testes). Nenhuma capacidade foi inferida de documentação aspiracional.

## Veredito

O backend VERAH já sustenta identidade, autenticação, onboarding e garagem de
cliente com RLS e testes de segurança. O app mobile **não existe** (nenhuma
referência a Expo/React Native no repositório). O caminho mais curto para um
build instalável iOS + Android é um app Expo falando **diretamente com o
Supabase existente** (anon key + RLS + RPCs), sem backend paralelo e sem
duplicar o Command Center.

## Mapa de capacidades Release 1.0

| # | Capacidade | Estado | Evidência |
| --- | --- | --- | --- |
| 1 | Cadastro/login | JÁ EXISTE (web) / FALTA (mobile) | Supabase Auth email/senha; `services/auth/actions.ts` (`signUpCustomerWithEmail`, `signInWithEmail`); `app/entrar/cliente/cadastro`; `user_profiles` + `verah_identities` (migrações `20260712210000`, `20260730150101`) |
| 2 | Onboarding | JÁ EXISTE (web + RPC) / FALTA (mobile) | State machine `identity_onboarding` + RPCs `start_customer_onboarding`, `complete_customer_basic_onboarding`, `refresh_customer_onboarding` (`20260827013000`); página `app/onboarding/cliente`; teste `supabase/tests/identity_onboarding_security.sql` |
| 3 | Cadastrar veículo / garagem | JÁ EXISTE (web + RPC) / FALTA (mobile) | Tabela `customer_vehicles` com RLS owner-based (`20260716000000`) + proveniência canônica (`data_source`, `customer_confirmed_at`, `lookup_source`/`lookup_provider`, `source_synthetic` — `20260827040000`, #139 mergeado em `7f0b987`); criação somente via RPC `confirm_customer_vehicle` (insert direto revogado de `authenticated`); onboarding por placa em `app/onboarding/cliente` + `services/customer-vehicles/`; testes `supabase/tests/vehicle_onboarding_security.sql` e `tests/vehicle-onboarding.test.mjs` |
| 4 | Quilometragem | PARCIAL | Campo `customer_vehicles.current_mileage` atualizável via RLS (grant de update inclui `current_mileage`); snapshot em `service_requests.mileage_snapshot`. FALTA histórico de registros de km |
| 5 | Abastecimentos e consumo | FALTA | Nenhuma tabela/serviço de abastecimento (busca em `supabase/migrations`, `services/`, `modules/`) |
| 6 | Despesas e custo por km | FALTA | Idem. Existe apenas ledger sandbox de pagamentos (#130), fora do escopo |
| 7 | Manutenções | PARCIAL | `last_service_at`, `next_service_date`, `next_service_mileage` em `customer_vehicles`; histórico de serviços VERAH via `service_requests`. FALTA registro de manutenções pela cliente |
| 8 | Lembretes por data/km | PARCIAL | Campos `next_service_date`/`next_service_mileage` existem; FALTA motor de lembretes/notificações para cliente |
| 9 | Documentos/notas/histórico | PARCIAL | `service_attachments` (anexos de atendimento, `20260731022348`); histórico de atendimentos na demo. FALTA documentos/notas da cliente por veículo |
| 10 | Dashboard "Quanto meu carro me custa?" | FALTA | Nenhuma agregação de custos para cliente |
| 11 | CTA "Preciso de ajuda" | JÁ EXISTE (backend + web demo) / FALTA (mobile) | `service_requests` + RLS de criação por cliente; `services/service-requests/actions.ts` (`createServiceRequest`); triagem `services/service-copilot`; intake `services/intelligent-intake`; acompanhamento via `service_stage` + `service_request_events` |

Fora do 1.0 (confirmado): saúde/score, Vehicle Intelligence/recalls (existe
fundação sintética em `services/vehicle-intelligence`), OCR, concierge
completo/leva-e-traz (fundação existe, #132), rede homologada (#134),
pagamentos/assinaturas (#130 sandbox), automações avançadas.

## Ativos reutilizáveis (não duplicar)

- **Auth/identidade:** Supabase Auth; `verah_identities`/`customers`/
  `identity_onboarding`/`user_profiles`; invariante "provedor de auth é método
  de login, não identidade" já codificado e testado
  (`supabase/tests/customer_identity_security.sql`,
  `tests/identity-onboarding.test.mjs`).
- **Schema/RLS:** grants `authenticated` + policies owner-based em
  `customer_vehicles`, `service_requests`, anexos. O padrão RLS permite o app
  mobile falar direto com o PostgREST usando somente a anon key. Exceção
  deliberada (#139): a criação de veículo é RPC-only
  (`confirm_customer_vehicle`) — insert direto em `customer_vehicles` é
  revogado de `authenticated`; leitura/update seguem owner-based.
- **RPCs:** onboarding de cliente (`start_customer_onboarding`,
  `complete_customer_basic_onboarding`, `refresh_customer_onboarding`) e
  confirmação de veículo (`confirm_customer_vehicle`, #139) reutilizáveis via
  `supabase-js` sem nenhum endpoint novo.
- **Serviços/domínio:** `services/service-copilot` (triagem determinística),
  `services/service-requests`, `data/vehicles.ts` + `data/locations.ts`
  (catálogos de validação portáveis, TS puro sem dependência Next).
- **Testes:** 240 testes Node (`tests/*.test.mjs`) + suíte de segurança SQL
  (`supabase/tests/*.sql`, executada por `pnpm ci:database`).
- **UI/brand:** design system Tailwind + tokens (`components/ui`, `docs/brand`)
  como referência visual; componentes web **não** são reutilizáveis no RN.

Não reutilizável no mobile (por natureza, não por defeito): Server Actions,
RSC, middleware Next, `services/supabase/server.ts` (cookies). O mobile usa
`@supabase/supabase-js` com AsyncStorage — mesmo projeto, mesmas tabelas,
mesmas RLS/RPCs.

## Decisão técnica de arquitetura mobile

**Expo (React Native) app único iOS/Android, cliente direto ao Supabase.**
Confirmada a preferência do épico porque:

1. o contrato de dados é PostgREST/Auth/RLS — independente de plataforma;
2. a anon key é pública por desenho e a RLS já restringe tudo por dono;
3. EAS Build entrega binários instaláveis sem toolchain nativo local;
4. nenhum código móvel conflitante existe no repositório.

Alternativa considerada e descartada para o 1.0: PWA (já existe demo instalável
via `app/manifest.ts`, porém o épico exige build nativo instalável e
distribuição TestFlight/Play).

## Riscos e dependências

- PR #139 (onboarding canônico de veículo) **mergeado** em `7f0b987`: o
  contrato final de `customer_vehicles` é canônico e estável para o mobile —
  leitura via RLS owner-based, criação/confirmação via RPC
  `confirm_customer_vehicle` (com proveniência obrigatória). O scaffold M1 já
  compõe com esse contrato (anon key + RLS + RPC, sem insert direto).
- Service role key e qualquer secret **jamais** no app: apenas
  `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- Contas Apple/Google, signing e publicação são HUMAN gates (M4).
- CI: o workspace mobile hoje é isolado do root (`tsconfig` exclui `mobile/`);
  integração de lockfile/workspaces é a primeira issue do backlog.
- Sem push notifications no 1.0 até decisão de credenciais FCM/APNs (HUMAN).

## Rota crítica até build instalável (resumo)

scaffold (este PR) -> deps/CI do workspace mobile -> auth mobile ->
onboarding + garagem mobile -> perfil de build EAS dev (APK interno) =
**M1 instalável**. Detalhes e issues em `docs/ship-verah/master-plan.md`.
