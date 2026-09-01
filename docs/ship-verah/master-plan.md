# SHIP VERAH — plano mestre executável (Issue #164)

Data: 2026-09-01. Companheiro da auditoria em
`docs/ship-verah/audit-release-1.0.md`. Escopo estritamente NÃO-produção.

## Princípios de execução

- Vertical slices demonstráveis; uma issue pequena por vez, ordenada pela rota
  crítica até o build instalável.
- Toda issue responde: **isso aproxima a VERAH de estar no celular de uma
  cliente?** Se não e não for bloqueador técnico/segurança, adiar.
- Zero backend paralelo: o app consome Supabase Auth + PostgREST + RPCs
  existentes, com anon key e RLS. Novas tabelas seguem o padrão já estabelecido
  (migration + grants mínimos + policies owner-based + teste de segurança SQL).
- HUMAN gates fail-closed: contas de loja, signing, credenciais, push,
  pagamentos, mensagens reais, qualquer migração remota e publicação.

## Marcos e saídas verificáveis

### M1 — VERAH no celular (rota crítica)
Saída: APK Android interno + build iOS (simulador/dev client) instaláveis em
ambiente não-prod, com login, onboarding e garagem funcionando contra o mesmo
Supabase.

1. Workspace mobile instalável e verificado (deps, lockfile, Expo SDK fixado).
2. Auth mobile: login/cadastro e sessão persistida (AsyncStorage) com o
   contrato `user_profiles`/`verah_identities`.
3. Onboarding mobile: RPCs `start_customer_onboarding`,
   `complete_customer_basic_onboarding`, `refresh_customer_onboarding`.
4. Garagem mobile: listar veículos via `customer_vehicles` (RLS owner-based) e
   criar/confirmar via RPC `confirm_customer_vehicle` (contrato final do #139,
   mergeado em `7f0b987`; insert direto revogado de `authenticated`).
5. Perfil EAS de desenvolvimento + APK interno (gate de build instalável).

### M2 — VERAH útil
Saída: cliente registra km, abastecimento, despesa e manutenção, recebe
lembretes derivados de data/km e vê o painel Quanto meu carro me custa?.

6. Registro de quilometragem (`vehicle_mileage_logs` + RLS + teste SQL).
7. Abastecimentos (`vehicle_fuel_logs`) + cálculo de consumo.
8. Despesas (`vehicle_expenses`) + custo por km + dashboard M2.
9. Manutenções pela cliente (`vehicle_maintenance_records`).
10. Lembretes por data/km (derivação local; push fora até gate de credenciais)
    + documentos/notas do veículo.

### M3 — VERAH resolve
Saída: CTA Preciso de ajuda no app cria `service_requests` real (pipeline de
intake/triagem existente) e a cliente acompanha o `service_stage` canônico.

11. Preciso de ajuda mobile + acompanhamento (projeção do estado canônico;
    sem segundo state machine).

### M4 — Distribuição
12. Perfis EAS de produção, TestFlight + teste fechado Android, checklist de
    loja. Todos os passos com conta/assinatura/publicação são HUMAN gates.

## Issues seguintes (pequenas, ordenadas por dependência)

Ordem de criação sugerida; cada uma cabe em um PR:

1. **Mobile workspace bootstrap**: instalar deps do `mobile/`, lockfile,
   `expo-doctor`, decisão pnpm workspaces vs. lockfile isolado, job de CI.
2. **Auth mobile (M1)**: telas de login/cadastro + sessão Supabase; teste de
   contrato com `user_profiles`/identidade.
3. **Onboarding + garagem mobile (M1)**: RPCs de onboarding + garagem sobre o
   contrato final do #139 (já mergeado em `7f0b987`): leitura de
   `customer_vehicles` via RLS, criação/confirmação via RPC
   `confirm_customer_vehicle` com proveniência obrigatória.
4. **EAS dev build (M1 gate)**: `eas.json` com perfis non-prod, APK interno,
   doc de instalação; iOS dev client sem conta paga enquanto possível.
5. **Quilometragem (M2)**: `vehicle_mileage_logs` + RLS + security test + tela.
6. **Abastecimentos e consumo (M2)**.
7. **Despesas, custo por km e dashboard (M2)**.
8. **Manutenções e lembretes data/km (M2)**.
9. **Documentos/notas do veículo (M2)**.
10. **Preciso de ajuda mobile + acompanhamento (M3)**.
11. **Distribuição M4**: HUMAN gates de contas Apple/Google e publicação.

## Segurança (inalterada)

- Apenas `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` no app;
  nunca service role ou qualquer secret server-side.
- Sem pagamentos reais, sem mensagens reais, sem migrações remotas, sem
  operações destrutivas, sem bypass de CI/review/RLS/branch protection.
- Demo/sintético nunca representado como produção.
