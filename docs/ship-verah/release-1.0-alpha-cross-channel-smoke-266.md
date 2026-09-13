# Release 1.0 — Alpha cross-channel smoke: App cliente → fila Concierge web (#266)

Data: 2026-09-13. Base: `main` atual. Refs: #266, #164, #252 (Human Gate de staging).

Escopo: **documentação repository-safe apenas**. Não executa banco remoto, `db push`,
`migration repair`/apply/reset/reconcile; não lida com secrets, produção,
pagamentos/mensagens reais, signing ou publicação. O smoke prova que o App cliente, o
Concierge web e o Prestador (Web/app) operam no **mesmo backend não-produtivo canônico**
(mesmo projeto Supabase, mesma `public.service_requests`).

## 0. Invariante canônica provada por este smoke

Um único Supabase **não-produtivo** (Alpha/staging) é a única fonte da verdade para
`public.service_requests`. O App cria a linha canônica com `origin='customer'`,
`service_stage='solicitado'`, `created_by`, `customer_id` e `vehicle_id`; o Concierge web
aceita e atribui e o Prestador executam transições canônicas — todos no **MESMO `service_request` canônico**
(a MESMA linha/vista da `public.service_requests`, sempre a **mesma tabela**), com RLS
`concierge/admin` e visibilidade por `provider_id`. Nenhuma cópia, espelho ou fila paralela.

## 1. Identificador de ambiente (não secreto) para o smoke

Ambos os canais expõem um descritor não secreto derivado da URL pública:

- **Web**: `NEXT_PUBLIC_SUPABASE_URL` → `projectRefFromUrl` (lib/verah-environment.ts);
  label `VERAH_RUNTIME_ENVIRONMENT` (`alpha`/`staging`/`qa`).
- **Mobile**: `EXPO_PUBLIC_SUPABASE_URL` → `resolveVerahEnvironmentDescriptor`
  (mobile/src/config.ts); label `EXPO_PUBLIC_SUPABASE_ENVIRONMENT` (`alpha`/`staging`/`qa`).
- Utilidade de convergência: `node scripts/canonical-backend/validate.ts` (fail-closed;
  encerra com status 1 quando web e mobile apontarem para backends/labels diferentes).

Palavras-chave **proibidas** no label: `production|prod|live|main` — falham fechado.
Referência do Alpha/staging durante o Release 1.0: `wxnklnbntgpcncajzpsj` (derivado da URL, **não é secret**).

## 2. Sequência determinística

| # | Ação | Resultado esperado | Evidência a capturar |
| --- | --- | --- | --- |
| 1 | (Lab) Confirmar backend único na configuração local/EAS | `scripts/canonical-backend/validate.ts` imprime `Canonical backend OK: web + mobile convergem em staging (wxnklnbntgpcncajzpsj)` | Terminal (sem chaves) |
| 2 | No APK: abrir o App e entrar como cliente | Home do cliente | Screenshot |
| 3 | No APK: criar um atendimento (veículo confirmado da garagem) | Mensagem de criação bem-sucedida com o `reference_code` (ex.: `VRH-ALPHA-266-XXXXX`) | Screenshot da tela de confirmação com o código |
| 4 | No Concierge **web** (`/concierge`): abrir a fila | A linha recém-criada aparece com o **mesmo** `reference_code` do passo 3, `service_stage='solicitado'`, origem `customer` | Screenshot da fila mostrando o código |
| 5 | Abrir o detalhe no Concierge web | `customer_name`/`customer_id`, `vehicle_id`/placa e `service_request` corretos (os mesmos exibidos no APK) | Screenshot do detalhe |
| 6 | No Concierge web: **aceitar** o atendimento (`accept_service_request`) | Linha muda para `concierge_aceitou`, liga o `concierge_id` na MESMA linha | Screenshot do detalhe |
| 7 | No Concierge web: **indicar o prestador** homologado ativo (`assign_provider_to_service_request`) | Linha muda para `prestador_indicado` com `provider_id` na MESMA linha | Screenshot do detalhe |
| 8 | No **Prestador Web** (`/demo/prestador`): abrir a fila/detalhe do prestador | O atendimento aparece **imediatamente** (mesma linha, mesma RLS por `provider_id` — a superfície do `getProviderServiceRequest`/`listProviderServiceRequests`). `customer_id`, `vehicle_id`, placa, cidade e relato corretos (mesmos do APK) | Screenshot da fila + detalhe |
| 9 | No Prestador Web: **salvar e enviar o orçamento** (`save_service_quote_draft` + `submit_service_quote`) | Linha canônica muda para `aguardando_aprovacao` e o orçamento fica visível para Concierge e Cliente | Screenshot |
| 10 | No **Cliente Web**: **aprovar o orçamento** (`approve_service_quote`) | Linha canônica muda para `em_execucao` e o orçamento fica `approved` na MESMA linha | Screenshot da tela do cliente |
| 11 | No Prestador Web: **concluir o atendimento** (`provider_mark_service_completed`) | `provider_completed_at` gravado na MESMA linha (estágio permanece `em_execucao` até a confirmação do Concierge) | Screenshot |
| 12 | No Concierge web: **reabrir o mesmo detalhe** | Mesma linha (mesmo `id`) com estágio `em_execucao`, prestador, orçamento `approved` e `provider_completed_at` preenchido — ação do prestador visível na MESMA linha | Screenshot |
| 13 | No **Cliente Web** (`/demo/cliente/atendimento/<id>`): abrir o detalhe | Cliente vê estágio `em_execucao`, `provider_completed_at`, a **projeção pública do prestador** (a mesma superfície do `getCustomerProviderProfile`: cidade/especialidades/avaliação — sem dados internos, sem `is_synthetic`, sem homologação/performance) e o orçamento aprovado | Screenshot |
| 14 | (Opcional) Criar atendimento pelo **Concierge web** (`/concierge/novo-atendimento`) | Nova linha com `origin='concierge'`, `service_stage='solicitado'` aparece **na mesma fila** | Screenshot |
| 15 | (Opcional) Recarregar o APK em "Meus atendimentos" | O atendimento criado no passo 14 aparece para o cliente dono (mesma linha, estágio canônico) | Screenshot |

## 3. Guardrails e fail-closed

- `service_requests_enforce_canonical_origin` (migration `20260913090000_canonical_backend_environment_guard.sql`):
  autenticado `customer` só cria `origin='customer'`+`service_stage='solicitado'`; autenticado
  `concierge/admin` só cria `origin='concierge'`+`service_stage='solicitado'`; prestador e
  sessão sem perfil VERAH falham fechado. `service_role` (WhatsApp/intake) permanece intacto.
- RLS "Role scoped service request access" inalterado: cliente vê `created_by=auth.uid()`;
  concierge/admin veem tudo; prestador vê `provider_id` atribuído.
- Nenhuma sincronização inventada entre dois Supabase: a correção é convergir os dois canais
  ao mesmo backend canônico (validação fail-closed em `scripts/canonical-backend/validate.ts`).

## 4. Evidência repository-safe executada

- Teste Node: `tests/canonical-environment.test.mjs` (drift web×mobile fail-closed, ref da URL).
- Teste Mobile: `mobile/tests/service-request.test.mjs` (descritor não secreto + fail-closed).
- Teste SQL (CI): `supabase/tests/canonical_backend_environment.sql`
  (app cria → concierge lê mesma linha; guard rejeita origem trocada/prestador/sem perfil;
  probe `verah_canonical_environment()` legível e sem chaves). Além do fluxo mínimo
  completo na MESMA linha canônica:
  **Cliente App cria → Concierge aceita (`accept_service_request`) → prestador atribuído
  vê (RLS por `provider_id`, superfície `getProviderServiceRequest`) → prestador envia
  orçamento (`save_service_quote_draft` + `submit_service_quote`) → Cliente aprova
  (`approve_service_quote` → `em_execucao`) → prestador conclui
  (`provider_mark_service_completed` → `provider_completed_at`) → Concierge e Cliente
  reencontram a MESMA linha**
  (sem `is_synthetic`, sem homologação/performance na superfície do cliente).
- Migration repository-only pendente: `20260913090000_canonical_backend_environment_guard.sql`
  (classificada em `PENDING_REPOSITORY_VERSIONS`).

## 5. Regressões conhecidas a conferir no físico

`R1` APK com URL antiga; `R2` APK com credencial anon antiga; `R3` deploy web com env
parcialmente vazio; `R4` onboarding sem veículo confirmado (insert negado por RLS —
comportamento esperado); `R5` dois APKs em projetos diferentes; `R6` **prestador não
atribuído não deve enxergar o atendimento** (RLS por `provider_id` — a fila do prestador
só mostra a MESMA linha canônica quando `provider_id` coincide).