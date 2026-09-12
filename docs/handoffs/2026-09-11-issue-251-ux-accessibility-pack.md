# Handoff — Issue #251 — Release 1.0 UX/accessibility pack (Draft PR)

Data: 2026-09-11 (pack), 2026-09-12 (rebase sobre `main` `da1d5d0`). Branch: `openhands/251-release-1.0-ux-accessibility-pack`. Base: `main` em `d391782` (`#232/#234`), rebases limpos sobre `c71ec30` e sobre `da1d5d0` (pós-merge #244/#246/#248 e do mapa #250). Refs: #164 (EPIC), #228/#229 (auditorias de aceite, merged), #233/#234 (mobile merged), #250 (merge-sequencing map, agora **merged**), #151/#255/#258 (Draft PRs abertas revalidadas após o merge de #250).

## Deliverable

QA pack **repository-safe** para copy/legibilidade/acessibilidade customer-facing do Release 1.0, composto de:

1. `docs/ship-verah/release-1.0-ux-accessibility-pack.md` — matriz por tela, princípios de copy, checklist de acessibilidade, follow-ups, evidência pós-gate;
2. `tests/release-1.0-ux-accessibility-copy-references.test.mjs` — teste estático (sem rede/secrets/DB) que verifica:
   - arquivos tocados não colidem com file sets das Draft PRs abertas #151/#255/#258 (snapshot atualizado no rebase de 2026-09-12 após o merge de #250);
   - copy customer-facing não contém termos crus de backend/env-var( "Supabase não configurado", "EXPO_PUBLIC_SUPABASE_*", "Chave de idempotência", "backend da VERAH");
   - fallbacks aprovados presentes (`App.tsx`, `service-request-supabase.ts`, `fipe-catalog.ts`, `vehicle-documents.ts`);
   - contratos canônicos citados( `customer_id`, `created_by`, `confirm_customer_vehicle`, `replace_customer_vehicle`, `register_vehicle_mileage/fuel/charging/maintenance`, `vehicle_expense_summary`, `createMobileServiceRequest`, `service_request`, RLS);
   - **litros e kWh distintos** ( sem conversão inventada);
   - mantenção assistida **draft-only até confirmação explícita** (`shouldConfirmAssistedSave`, "Confirmar e salvar", campos em branco no rascunho).


## Bounded copy fixes (arquivos sem dono)

| Arquivo | Antes | Depois |
| --- | --- | --- |
| `mobile/App.tsx` (`FailClosedNotice`) | expunha `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` e "Supabase não configurado. Verifique EXPO_PUBLIC_SUPABASE_URL" | "VERAH ainda não está conectada neste ambiente. Nenhuma informação é enviada ou recebida enquanto a configuração não estiver completa." |
| `mobile/src/service-request-supabase.ts` | "Supabase client is not configured" ( message herdada pelo facade) | "A conexão com a VERAH não está configurada neste build." |
| `mobile/src/fipe-catalog.ts` | "…configurado no backend da VERAH." | "…configurado na VERAH." ( remove "backend") |
| `mobile/src/vehicle-documents.ts` | "Chave de idempotência inválida." | "Houve um erro ao preparar o arquivo. Tente novamente." |

Teste mobile atualizado: `mobile/tests/vehicle-documents.test.mjs` (asserções de limite/mensagem idempotência).

## Não-colisão

Nenhum arquivo dono de Draft PR foi tocado. O teste estático leva snapshot dos file sets das Draft PRs abertas na data deste pack e falha se qualquer arquivo do pack cruzar esse conjunto.



## Validação executada

| Comando | Resultado |
| --- | --- |
| `node --experimental-strip-types --test tests/release-1.0-ux-accessibility-copy-references.test.mjs` | ver seção 6 do doc QA( esperado pass na PR CI) |
| `cd mobile && node --experimental-strip-types --test tests/vehicle-documents.test.mjs` | verificar após commit; CI é a fonte da verdade |

## Riscos / blockers

- **FÍSICO**: validação de leitor de tela/contraste/touch targets/safe areas exigem dispositivo físico e os Human Gates de build/distribuição (#228/#229/#248) — **não executados aqui**.
- Draft PR **não merge**; nenhuma migration remota, secret, conta, publicação.
- Files donos de #244 (`FuelHistoryScreen.tsx`, `customer-journey.ts`, testes) não foram editados; #244 foi **merged** em 2026-09-12 e a colisão original foi substituída por #255 (`design-system-v1`), que agora é dona de 9 telas mobile — follow-ups F2/F3/F5/F6 citam isso.



## Handoff

- PR Draft: abrir a partir desta branch.
- CI: verificar checks da PR; se verde, deixar para revisão humana.
- Próximo issue possível: F1–F6 do doc( cada um como issue separada com escopo próprio).
