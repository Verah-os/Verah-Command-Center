# Release 1.0 — Alpha cross-channel smoke: App cliente → fila Concierge web (#266)

Data: 2026-09-13. Base: `main` atual. Refs: #266, #164, #252 (Human Gate de staging).

Escopo: **documentação repository-safe apenas**. Não executa banco remoto, `db push`,
`migration repair`/apply/reset/reconcile; não lida com secrets, produção,
pagamentos/mensagens reais, signing ou publicação. O smoke prova que o App cliente e o Concierge web conversam com o
**mesmo backend não-produtivo canônico** (mesmo projeto Supabase, mesma `public.service_requests`).

## 0. Invariante canônica provada por este smoke

Um único Supabase **não-produtivo** (Alpha/staging) é a única fonte da verdade para
`public.service_requests`. O App cria a linha canônica com `origin='customer'`,
`service_stage='solicitado'`, `created_by`, `customer_id` e `vehicle_id`; o Concierge web
lê a **mesma tabela** com RLS `concierge/admin`. Nenhuma cópia, espelho ou fila paralela.

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
| 6 | (Opcional) Criar atendimento pelo **Concierge web** (`/concierge/novo-atendimento`) | Nova linha com `origin='concierge'`, `service_stage='solicitado'` aparece **na mesma fila** | Screenshot |
| 7 | (Opcional) Recarregar o APK em "Meus atendimentos" | O atendimento criado no passo 6 aparece para o cliente dono (mesma linha, estágio canônico) | Screenshot |

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
  probe `verah_canonical_environment()` legível e sem chaves).
- Migration repository-only pendente: `20260913090000_canonical_backend_environment_guard.sql`
  (classificada em `PENDING_REPOSITORY_VERSIONS`).