# Plano operacional — migration de autorização administrativa

## 1. Escopo, estado e proibições

Este documento prepara a implantação controlada da migration
`20260727225432_secure_admin_authorization.sql`. Ele não autoriza nem executa
qualquer operação em produção.

Continuam proibidos durante esta etapa:

- `supabase db push`;
- `supabase migration repair`;
- SQL remoto;
- alteração de schema ou dados;
- restauração, deployment ou teste destrutivo;
- uso de `service_role` em cliente, logs ou arquivos;
- reativação de **GitHub Integration → Deploy to production**;
- conexão da produção à CI.

Estado de referência do código:

- branch de origem: `main`;
- commit auditado: `916d08a050dd39055b837e62e8c4343b0690a42e`;
- Supabase CLI validado pela CI: `2.110.0`;
- migration alvo: última migration local;
- SHA-256 da migration alvo:
  `7e0c650d130dedd97b8384fae3dfa3430b5c159ea32ab60ea93f70aef77c9ab5`;
- migrations posteriores: nenhuma;
- deploy automático de produção do Supabase: deve permanecer desabilitado.

## 2. Diagnóstico local

### 2.1 Histórico de migrations

Existem 26 migrations locais, em ordem:

| Ordem | Versão | Nome |
| ---: | --- | --- |
| 1 | `20260709050000` | `create_work_orders` |
| 2 | `20260709053000` | `create_dispatcher_jobs` |
| 3 | `20260709060000` | `create_dispatcher_pipeline` |
| 4 | `20260709063000` | `allow_work_order_creation` |
| 5 | `20260709070000` | `fix_work_order_insert_rls` |
| 6 | `20260709071000` | `ensure_dispatcher_jobs_pipeline` |
| 7 | `20260709073000` | `create_ai_agents` |
| 8 | `20260709080000` | `dispatcher_engine_runtime_fields` |
| 9 | `20260709083000` | `dispatcher_agent_selection_rules` |
| 10 | `20260709090000` | `dispatcher_execution_controls` |
| 11 | `20260709093000` | `create_system_settings` |
| 12 | `20260711010000` | `dispatcher_ai_runtime_completion` |
| 13 | `20260712000000` | `create_service_requests` |
| 14 | `20260712033000` | `create_concierge_acceptance` |
| 15 | `20260712043000` | `create_service_providers` |
| 16 | `20260712053000` | `create_service_quotes` |
| 17 | `20260712190000` | `quote_integrity_clarity` |
| 18 | `20260712200000` | `complete_service_journey` |
| 19 | `20260712210000` | `create_user_profiles` |
| 20 | `20260712220000` | `secure_provider_actions` |
| 21 | `20260713000000` | `add_service_request_state` |
| 22 | `20260714000000` | `customer_answers_provider_reassignment` |
| 23 | `20260714010000` | `fix_triage_providers_insurance` |
| 24 | `20260715000000` | `concierge_lifecycle` |
| 25 | `20260716000000` | `create_customer_vehicles` |
| 26 | `20260727225432` | `secure_admin_authorization` |

A CI reproduz as 25 primeiras migrations, injeta apenas fixtures sintéticas,
aplica a migration alvo e depois repete as 26 migrations desde um banco vazio
com `--no-seed`.

### 2.2 Objetos e dados afetados

A migration não contém `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `DROP TABLE`
ou alteração de colunas. Ela afeta:

| Categoria | Objetos | Efeito |
| --- | --- | --- |
| RLS | `work_orders`, `dispatcher_jobs`, `ai_agents`, `system_settings` | garante RLS habilitada |
| Policies | 6 policies administrativas | remove policies abertas e exige papel `admin` |
| Grants | 4 tabelas e uma coluna | remove grants de `anon`; reduz `authenticated` ao mínimo necessário |
| Funções | 6 funções `SECURITY DEFINER` | adiciona guarda de Admin ou papel técnico `service_role` |
| Fonte de papel | `user_profiles`, `current_verah_role()` | mantém `user_profiles.role` como fonte operacional |

Policies finais esperadas:

1. `Admins can read work orders`;
2. `Admins can create work orders`;
3. `Admins can read dispatcher jobs`;
4. `Admins can read ai agents`;
5. `Admins can read system settings`;
6. `Admins can update editable system settings`.

Funções privilegiadas:

1. `dispatcher_engine_start_next_job()`;
2. `dispatcher_engine_finish_job(uuid,text,boolean)`;
3. `dispatcher_engine_retry_failed_job(uuid)`;
4. `dispatcher_engine_mark_job_completed(uuid)`;
5. `dispatcher_engine_mark_job_failed(uuid)`;
6. `dispatcher_complete_ai_runtime_job(uuid,text,boolean,integer,text,text,text)`.

Dependências obrigatórias:

- schemas `public`, `auth` e `supabase_migrations`;
- tabelas `work_orders`, `dispatcher_jobs`, `ai_agents`, `system_settings` e
  `user_profiles`;
- colunas e constraints criadas pelas 25 migrations anteriores;
- `auth.uid()`;
- `public.current_verah_role()`;
- `public.dispatcher_engine_log_entry(text)`;
- papéis Postgres `anon`, `authenticated` e `service_role`.

### 2.3 Locks, disponibilidade e sessões existentes

- `ALTER TABLE`, `DROP/CREATE POLICY` e `REVOKE/GRANT` adquirem locks na
  relação e no catálogo. Adotar conservadoramente que DDL pode aguardar ou
  bloquear operações concorrentes até o commit.
- `CREATE OR REPLACE FUNCTION` invalida o plano anterior para novas chamadas;
  chamadas que começarem depois do commit passam a usar a nova guarda.
- não há table rewrite, varredura de linhas nem alteração deliberada de dados;
  o risco de perda de dados pela migration é baixo.
- a transação torna a troca de policies atômica para outras sessões, mas uma
  espera por lock pode alongar a janela.
- usuários não administrativos já autenticados perdem o acesso administrativo
  indevido assim que a transação é confirmada.
- Admin depende de `user_profiles.role = 'admin'`; perfil ausente,
  inconsistente ou papel antigo faz a autorização falhar fechada.
- o papel operacional é consultado no banco a cada decisão; se um papel for
  corrigido, encerrar sessões existentes e exigir novo login continua sendo a
  prática operacional recomendada.
- o bypass técnico depende da claim assinada `service_role`; ele nunca deve
  ser validado a partir de metadata editável pelo usuário.

### 2.4 Evidência local existente

O ambiente local oficial já validou:

- aplicação das 25 migrations anteriores desde zero;
- aplicação transacional da migration alvo;
- reaplicação acidental sem erro;
- preservação das contagens de oito tabelas;
- RLS nas quatro tabelas administrativas;
- grants mínimos;
- seis funções recusando Customer, Concierge, Provider e perfil ausente;
- Admin autorizado;
- papel inválido recusado por constraint;
- restauração lógica em outro banco local;
- schema lint sem erros;
- testes Node, typecheck, lint e build.

Essa evidência prova a migration contra o schema produzido pelo Git. Ela não
prova equivalência com o schema atual de produção.

## 3. Divergência do histórico remoto

### 3.1 Causa conhecida

Parte das mudanças históricas foi aplicada diretamente pelo Dashboard/SQL
Editor. Esse caminho pode alterar o schema sem inserir a versão correspondente
em `supabase_migrations.schema_migrations`. Git e Supabase passam, então, a
descrever dimensões diferentes:

- Git contém o SQL que deveria compor o histórico;
- o schema remoto pode conter parte ou todo o efeito desse SQL;
- a tabela remota de migrations pode não registrar as mesmas versões.

A migration alvo permanece apenas versionada e não foi aplicada em produção.

### 3.2 Divergência ainda não enumerada

Sem uma consulta somente leitura ao projeto remoto, não é possível declarar
quais das 25 versões anteriores:

- estão registradas e materializadas;
- estão materializadas, mas não registradas;
- estão registradas, mas não materializadas integralmente;
- possuem drift em relação ao arquivo local;
- não existem no histórico nem no schema.

Essa enumeração é um critério obrigatório de **no-go**. Não se deve executar
`db push --include-all` nem marcar versões como aplicadas por inferência.

### 3.3 Opções de reconciliação

| Opção | Quando usar | Risco | Decisão |
| --- | --- | --- | --- |
| Marcar versões como `applied` | efeito integral comprovado objeto a objeto | ocultar drift parcial | preferível apenas com evidência completa |
| Marcar versão como `reverted` | histórico registra algo comprovadamente ausente | permitir reaplicação perigosa | excepcional |
| `db pull` para capturar estado remoto | alterações remotas legítimas sem arquivo local | gerar baseline/diff grande | útil para análise isolada |
| Nova migration de convergência | estado remoto parcialmente divergente | exige revisão e novo ciclo de CI | preferível quando não há equivalência exata |
| Aplicação manual de SQL | emergência formalmente aprovada | histórico volta a divergir | não recomendada |
| `db push --include-all` | histórico confiável e migrations antigas realmente ausentes | pode reaplicar toda a evolução | proibida neste plano |

Estratégia tecnicamente preferível:

1. listar histórico local/remoto;
2. capturar catálogo remoto somente leitura;
3. comparar cada versão ausente com o efeito esperado;
4. marcar como `applied` apenas versões com equivalência comprovada;
5. criar uma migration de convergência para qualquer drift parcial;
6. exigir que o dry-run final mostre exclusivamente
   `20260727225432_secure_admin_authorization.sql`;
7. aplicar a migration alvo pelo fluxo normal de migrations.

### 3.4 Evidência exigida antes de qualquer repair

Para cada versão candidata a repair:

- versão local e nome do arquivo;
- objetos que a migration cria ou altera;
- prova de existência desses objetos;
- definições normalizadas ou fingerprints;
- constraints, índices, triggers, policies, RLS e grants esperados;
- confirmação de que DML idempotente necessário já ocorreu;
- ausência de efeito parcial;
- revisão por duas pessoas;
- backup restaurável anterior ao repair;
- transcrição sanitizada do antes/depois de `migration list`.

`migration repair` altera apenas o histórico. Ele não corrige schema, dados,
policies ou funções.

## 4. Informações mínimas necessárias de produção

Nenhum valor deve ser incluído em commits ou logs públicos.

1. referência do projeto, fornecida ao operador por canal seguro;
2. credencial temporária e de menor privilégio compatível com a operação;
3. versão do PostgreSQL;
4. versão da Supabase CLI no posto de operação;
5. saída sanitizada de `supabase migration list --linked`;
6. catálogo dos objetos afetados e seus fingerprints;
7. RLS, policies, grants e ACLs atuais;
8. contagens agregadas das tabelas relevantes;
9. quantidade agregada de perfis por papel;
10. quantidade de usuários autenticados sem perfil;
11. quantidade de perfis inválidos ou inconsistentes;
12. pelo menos uma conta canário controlada por papel;
13. tipo, horário e retenção do último backup;
14. evidência de restore test em ambiente isolado;
15. tamanho do banco e carga da janela;
16. presença de queries longas ou locks;
17. commit atualmente implantado na Vercel;
18. responsáveis por operação, validação e decisão de rollback.

## 5. Backup e restauração

### 5.1 Camadas de backup

Usar duas camadas independentes:

1. **backup físico gerenciado ou PITR**, quando disponível, cobrindo todo o
   projeto;
2. **dump lógico criptografado**, criado imediatamente antes da janela.

O backup físico é a última linha de recuperação integral. O dump lógico é a
opção preferida para inspecionar e restaurar objetos específicos sem substituir
todo o projeto.

### 5.2 Conteúdo mínimo

Incluir:

- schema e dados de `public`;
- dados necessários de `auth` para preservar relacionamentos com
  `user_profiles`;
- metadados de `storage`, se houver relacionamentos relevantes;
- `supabase_migrations.schema_migrations`;
- funções, policies, grants, triggers, constraints e índices;
- roles customizadas, sem senhas;
- definições exatas das seis funções antes da migration.

Objetos do Storage API não são restaurados por um backup apenas do banco; se o
escopo de recuperação exigir arquivos, a política de Storage deve ser
confirmada separadamente.

### 5.3 Comandos propostos — não executar nesta etapa

Os placeholders devem ser fornecidos em sessão efêmera. Senhas e tokens não
devem aparecer em argumentos, histórico do shell ou arquivos.

```bash
# Somente no posto de operação aprovado.
supabase --version
supabase link --project-ref "$PROD_PROJECT_REF"

# Schema, dados e roles em diretório criptografado fora do repositório.
supabase db dump --linked \
  --schema public \
  --file "$SECURE_BACKUP_DIR/public-schema.sql"

supabase db dump --linked \
  --data-only \
  --use-copy \
  --schema public,auth,storage \
  --file "$SECURE_BACKUP_DIR/application-data.sql"

supabase db dump --linked \
  --role-only \
  --file "$SECURE_BACKUP_DIR/custom-roles.sql"

supabase db dump --linked \
  --data-only \
  --schema supabase_migrations \
  --file "$SECURE_BACKUP_DIR/migration-history.sql"
```

Antes da execução real, confirmar os flags com
`supabase db dump --help` na versão `2.110.0`. Se a versão instalada produzir
semântica diferente, parar.

Gerar checksums sem imprimir o conteúdo:

```bash
sha256sum "$SECURE_BACKUP_DIR"/*.sql \
  > "$SECURE_BACKUP_DIR/SHA256SUMS"
```

### 5.4 Prova de restauração

Um backup só é considerado restaurável quando:

- os checksums conferem;
- o dump é restaurado em Supabase local ou projeto temporário isolado;
- a restauração termina sem erro;
- contagens agregadas conferem;
- constraints e foreign keys estão válidas;
- as quatro tabelas mantêm RLS;
- policies, grants e seis funções são recuperadas;
- a aplicação consegue autenticar contas exclusivamente sintéticas;
- nenhum dado do dump é publicado ou enviado à CI.

O teste lógico local não prova sozinho a restauração do backup físico
gerenciado. Quando o risco exigir restore físico, usar um projeto isolado
somente após autorização específica.

### 5.5 Retenção

- manter o backup criptografado durante a implantação e por 14 dias após
  estabilidade confirmada;
- limitar acesso aos responsáveis nomeados;
- registrar checksum, horário, operador e teste de restauração;
- excluir pelo processo seguro aprovado após a retenção;
- nunca anexar dumps a PRs, Issues ou artefatos de CI.

## 6. Pré-validação somente leitura

As consultas abaixo devem ser executadas por operador autorizado e ter saída
sanitizada. Não retornar e-mails, nomes, payloads, logs ou conteúdo de settings.

### 6.1 Versão e histórico

```sql
select version();

select version, name
from supabase_migrations.schema_migrations
order by version;
```

Comparação pela CLI:

```bash
supabase migration list --linked
```

### 6.2 Existência, RLS e contagens

```sql
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'work_orders',
    'dispatcher_jobs',
    'ai_agents',
    'system_settings',
    'user_profiles'
  )
order by c.relname;

select 'work_orders' as resource, count(*) from public.work_orders
union all
select 'dispatcher_jobs', count(*) from public.dispatcher_jobs
union all
select 'ai_agents', count(*) from public.ai_agents
union all
select 'system_settings', count(*) from public.system_settings
union all
select 'user_profiles', count(*) from public.user_profiles;
```

Registrar apenas totais.

### 6.3 Perfis e inconsistências

```sql
select role, count(*)
from public.user_profiles
group by role
order by role;

select count(*) as invalid_role_count
from public.user_profiles
where role is null
   or role not in ('customer', 'concierge', 'provider', 'admin');

select count(*) as inconsistent_provider_profile_count
from public.user_profiles
where (role = 'provider' and provider_id is null)
   or (role <> 'provider' and provider_id is not null);

select count(*) as authenticated_without_profile_count
from auth.users u
left join public.user_profiles p on p.user_id = u.id
where p.user_id is null;

select count(*) as admin_count
from public.user_profiles
where role = 'admin';
```

Usuário sem perfil pode ser legítimo durante onboarding, mas deve falhar de
forma fechada. Qualquer papel inválido ou perfil Provider inconsistente é
**no-go**.

### 6.4 Policies

```sql
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'work_orders',
    'dispatcher_jobs',
    'ai_agents',
    'system_settings'
  )
order by tablename, policyname;
```

Antes da migration, confirmar as policies realmente existentes. Se o baseline
remoto não for equivalente ao esperado pelas migrations anteriores, parar e
produzir uma migration de convergência.

### 6.5 Grants

```sql
select grantee, table_schema, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'work_orders',
    'dispatcher_jobs',
    'ai_agents',
    'system_settings'
  )
  and grantee in ('anon', 'authenticated', 'PUBLIC')
order by table_name, grantee, privilege_type;

select grantee, table_name, column_name, privilege_type
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'system_settings'
  and grantee in ('anon', 'authenticated', 'PUBLIC')
order by grantee, column_name, privilege_type;
```

### 6.6 Funções privilegiadas

```sql
with privileged_functions(signature) as (
  values
    ('dispatcher_engine_start_next_job()'),
    ('dispatcher_engine_finish_job(uuid,text,boolean)'),
    ('dispatcher_engine_retry_failed_job(uuid)'),
    ('dispatcher_engine_mark_job_completed(uuid)'),
    ('dispatcher_engine_mark_job_failed(uuid)'),
    ('dispatcher_complete_ai_runtime_job(uuid,text,boolean,integer,text,text,text)')
)
select
  p.oid::regprocedure::text as signature,
  p.prosecdef as security_definer,
  p.proconfig as function_config,
  md5(pg_get_functiondef(p.oid)) as definition_fingerprint,
  has_function_privilege('anon', p.oid, 'execute') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'execute')
    as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'execute')
    as service_role_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join privileged_functions f
  on f.signature = p.oid::regprocedure::text
where n.nspname = 'public'
order by signature;
```

Exigir exatamente seis linhas.

### 6.7 Carga e locks

```sql
select state, wait_event_type, wait_event, count(*)
from pg_stat_activity
where datname = current_database()
group by state, wait_event_type, wait_event
order by state, wait_event_type, wait_event;

select mode, granted, count(*)
from pg_locks
where database = (select oid from pg_database where datname = current_database())
group by mode, granted
order by mode, granted;
```

Não coletar nem publicar textos de queries.

## 7. Implantação controlada

### 7.1 Responsáveis

Quatro papéis distintos:

- **Release lead:** conduz checklist e declara go/no-go;
- **DB operator:** único responsável por credenciais e comandos;
- **Application validator:** executa matriz funcional;
- **Rollback approver/observer:** acompanha métricas e autoriza reversão.

Uma mesma pessoa não deve executar e aprovar repair sem segunda revisão.

### 7.2 Janela

Reservar 30 minutos de baixa atividade:

- 10 minutos para confirmação final e backup;
- menos de 1 minuto esperado para DDL, com limite operacional de 5 minutos;
- 15 minutos para validação e observação;
- 5 minutos de margem.

O teste local aplicou a migration em menos de um segundo, mas produção pode ter
locks e carga diferentes. A migration não reescreve tabelas nem percorre dados.

### 7.3 Sequência e pontos de parada

Todos os comandos abaixo são propostos, não executados por este PR.

1. Congelar merges e operações administrativas.
2. Confirmar Vercel estável no commit aprovado.
3. Confirmar Deploy to production do Supabase desabilitado.
4. Confirmar CLI `2.110.0` e checkout limpo no commit aprovado.
5. Executar pré-validação somente leitura.
6. Confirmar backup físico/PITR e gerar dump lógico.
7. Restaurar o dump em ambiente isolado.
8. Capturar definições pré-deploy para rollback.
9. Executar `migration list`.
10. Reconciliar histórico somente se cada versão possuir evidência aprovada.
11. Repetir `migration list`.
12. Executar dry-run.
13. Parar se o dry-run listar qualquer item diferente da migration alvo.
14. Obter aprovação verbal/escrita do Release lead e Rollback approver.
15. Aplicar a migration.
16. Executar pós-validação.
17. Observar erros e latência por 15 minutos.
18. Encerrar a janela ou iniciar rollback dentro do limite definido.

Comandos de inspeção:

```bash
git status --short
git rev-parse HEAD
sha256sum supabase/migrations/20260727225432_secure_admin_authorization.sql
supabase --version
supabase migration list --linked
```

**Dry-run obrigatório:**

```bash
supabase db push --linked --dry-run
```

Saída aceita: exclusivamente
`20260727225432_secure_admin_authorization.sql`. Não usar `--include-all`,
`--include-seed` ou `--include-roles`.

**Comando que faria a aplicação real, somente após autorização específica:**

```bash
supabase db push --linked
```

Pontos de parada obrigatórios:

- SHA, CLI ou configuração não conferem;
- backup não é restaurável;
- histórico não é explicável;
- dry-run não contém exatamente uma migration;
- qualquer objeto dependente está ausente ou divergente;
- RLS já está desabilitada;
- role inválido ou perfil Provider inconsistente;
- não existe Admin canário válido;
- lock não concedido, query longa ou degradação ativa;
- Vercel não está estável;
- falta um dos responsáveis.

## 8. Pós-validação

### 8.1 Catálogo

Executar a versão somente leitura de
`supabase/tests/admin_authorization_catalog.sql` e confirmar:

- quatro tabelas com RLS;
- seis policies administrativas;
- `anon` sem privilégios;
- grants mínimos para `authenticated`;
- seis funções sem execute para `anon`;
- seis funções alcançáveis por `authenticated`, mas protegidas internamente.

Repetir contagens agregadas e comparar com o baseline.

### 8.2 Matriz por papel

Usar contas canário sem dados pessoais. Não usar contas reais de clientes.

| Papel | Recursos administrativos | Funções privilegiadas | Fluxo normal |
| --- | --- | --- | --- |
| Customer | nenhuma linha | 6/6 recusadas | portal e recursos próprios |
| Concierge | nenhuma linha | 6/6 recusadas | fila operacional |
| Provider | nenhuma linha | 6/6 recusadas | somente atendimento atribuído |
| Sem perfil | falha fechada | 6/6 recusadas | redirecionamento previsível |
| Papel inválido | constraint recusa | não aplicável | não aplicável |
| Admin | acesso esperado | 6/6 autorizadas | Command Center |

Para validar as seis funções sem deixar mutações:

1. abrir transação explícita;
2. `SET LOCAL ROLE authenticated`;
3. configurar claims somente para a conta canário;
4. usar UUIDs sintéticos inexistentes nas funções que aceitam identificador;
5. preparar registros sintéticos dentro da mesma transação para
   `dispatcher_engine_start_next_job()`;
6. executar a matriz;
7. executar `ROLLBACK`;
8. repetir contagens e confirmar igualdade.

Esse teste ainda adquire locks breves. Deve ocorrer dentro da janela, com fila
administrativa congelada. Nunca imprimir tokens ou payloads.

### 8.3 Aplicação e Vercel

- confirmar deployment da Vercel em `READY`;
- confirmar commit esperado;
- testar login e logout das quatro rotas por papel;
- verificar ausência de loop/404;
- observar erros de autorização, RPC, PostgREST e Server Actions;
- não iniciar deployment manual;
- não alterar variáveis de ambiente.

## 9. Rollback

### 9.1 Estratégia

Ordem preferida:

1. **forward fix** para erro de perfil, grant ou policy claramente identificado;
2. **migration reversa transacional** para restaurar o baseline capturado;
3. **restauração lógica seletiva** se objetos estiverem inconsistentes;
4. **backup físico/PITR** somente para corrupção ampla ou perda de dados.

A migration não altera dados, portanto uma reversão DDL é normalmente menos
disruptiva do que restaurar o projeto inteiro. Restauração física torna o
projeto indisponível e pode perder mudanças posteriores ao ponto escolhido.

O rollback completo restaura o modelo anterior, no qual usuários autenticados
possuíam acesso administrativo mais amplo. Ele reduz a segurança e só deve ser
usado se o forward fix não for viável dentro da janela.

### 9.2 Captura exata das funções

Antes do deploy, executar esta consulta somente leitura e salvar o resultado
em arquivo criptografado fora do repositório:

```sql
select pg_get_functiondef(p.oid) || E';\n'
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.oid::regprocedure::text in (
    'dispatcher_engine_start_next_job()',
    'dispatcher_engine_finish_job(uuid,text,boolean)',
    'dispatcher_engine_retry_failed_job(uuid)',
    'dispatcher_engine_mark_job_completed(uuid)',
    'dispatcher_engine_mark_job_failed(uuid)',
    'dispatcher_complete_ai_runtime_job(uuid,text,boolean,integer,text,text,text)'
  )
order by p.oid::regprocedure::text;
```

Exigir seis definições e registrar checksum. Essas definições, não uma cópia
presumida do Git, compõem `predeploy-function-definitions.sql`.

### 9.3 SQL reverso preparado

O arquivo abaixo deve ser materializado em diretório seguro, substituir o
placeholder pelo caminho aprovado e ser ensaiado no restore isolado. Não
executar a partir deste documento.

```sql
\set ON_ERROR_STOP on

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Restaura exatamente as seis definições capturadas antes do deploy.
\ir '<SECURE_BACKUP_DIR>/predeploy-function-definitions.sql'

drop policy if exists "Admins can read work orders"
  on public.work_orders;
drop policy if exists "Admins can create work orders"
  on public.work_orders;
drop policy if exists "Admins can read dispatcher jobs"
  on public.dispatcher_jobs;
drop policy if exists "Admins can read ai agents"
  on public.ai_agents;
drop policy if exists "Admins can read system settings"
  on public.system_settings;
drop policy if exists "Admins can update editable system settings"
  on public.system_settings;

create policy "Authenticated users can read work orders"
  on public.work_orders
  for select
  to authenticated
  using (true);

create policy "Authenticated users can create work orders"
  on public.work_orders
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and status = 'Backlog'
    and priority in ('Low', 'Medium', 'High', 'Critical')
    and origin in ('Manual', 'GitHub', 'Dispatcher', 'AI')
    and title is not null
    and description is not null
  );

create policy "Authenticated users can read dispatcher jobs"
  on public.dispatcher_jobs
  for select
  to authenticated
  using (true);

create policy "Authenticated users can read ai agents"
  on public.ai_agents
  for select
  to authenticated
  using ((select auth.uid()) is not null);

create policy "Authenticated users can read system settings"
  on public.system_settings
  for select
  to authenticated
  using ((select auth.uid()) is not null);

create policy "Authenticated users can update editable system settings"
  on public.system_settings
  for update
  to authenticated
  using ((select auth.uid()) is not null and is_editable = true)
  with check ((select auth.uid()) is not null and is_editable = true);

revoke all on table public.work_orders from anon, authenticated;
grant select, insert on table public.work_orders to authenticated;

revoke all on table public.dispatcher_jobs from anon, authenticated;
grant select on table public.dispatcher_jobs to authenticated;

revoke all on table public.ai_agents from anon, authenticated;
grant select on table public.ai_agents to authenticated;

revoke all on table public.system_settings from anon, authenticated;
grant select on table public.system_settings to authenticated;
grant update (value) on table public.system_settings to authenticated;

revoke all on function public.dispatcher_engine_start_next_job()
  from public, anon, authenticated, service_role;
grant execute on function public.dispatcher_engine_start_next_job()
  to authenticated;

revoke all on function public.dispatcher_engine_finish_job(
  uuid,
  text,
  boolean
) from public, anon, authenticated, service_role;
grant execute on function public.dispatcher_engine_finish_job(
  uuid,
  text,
  boolean
) to authenticated;

revoke all on function public.dispatcher_engine_retry_failed_job(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.dispatcher_engine_retry_failed_job(uuid)
  to authenticated;

revoke all on function public.dispatcher_engine_mark_job_completed(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.dispatcher_engine_mark_job_completed(uuid)
  to authenticated;

revoke all on function public.dispatcher_engine_mark_job_failed(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.dispatcher_engine_mark_job_failed(uuid)
  to authenticated;

revoke all on function public.dispatcher_complete_ai_runtime_job(
  uuid,
  text,
  boolean,
  integer,
  text,
  text,
  text
) from public, anon, authenticated, service_role;
grant execute on function public.dispatcher_complete_ai_runtime_job(
  uuid,
  text,
  boolean,
  integer,
  text,
  text,
  text
) to authenticated;

commit;
```

Não executar `migration repair --status reverted` como parte automática do
rollback. A reversão deve ser registrada por uma nova migration revisada. O
histórico da migration original permanece verdadeiro: ela foi aplicada e uma
migration posterior a desfez.

### 9.4 Limite para decisão

- erro crítico de autenticação ou autorização: decidir em até 10 minutos;
- indisponibilidade ampla: interromper imediatamente e avaliar rollback;
- máximo de 15 minutos após aplicação para iniciar reversão DDL;
- após esse período, reavaliar drift e atividade antes de restaurar;
- restauração física exige declaração formal de incidente e avaliação de perda
  de dados desde o ponto de recuperação.

## 10. Critérios objetivos de go/no-go

### GO somente se todos forem verdadeiros

- `main` e Vercel estão no commit aprovado;
- `CI / Required` está em sucesso;
- Deploy to production do Supabase está desabilitado;
- CLI é exatamente `2.110.0` ou uma mudança foi revalidada;
- histórico remoto foi enumerado e explicado;
- cada repair proposto possui prova objeto a objeto e duas aprovações;
- dry-run lista somente a migration alvo;
- backup físico/PITR foi confirmado;
- dump lógico possui checksum e restore test aprovado;
- baseline de contagens foi registrado;
- seis funções e quatro tabelas possuem baseline;
- RLS está habilitada;
- papéis inválidos e perfis Provider inconsistentes são zero;
- existe Admin canário válido;
- locks/carga permitem a janela;
- rollback foi materializado, revisado e ensaiado;
- quatro responsáveis estão presentes.

### NO-GO se qualquer condição ocorrer

- histórico remoto desconhecido ou contraditório;
- `db push --dry-run` propõe migrations adicionais;
- objeto esperado ausente ou definição divergente;
- necessidade de `--include-all`;
- backup sem teste de restauração;
- credencial exposta;
- falta de Admin válido;
- papel inválido ou perfil inconsistente;
- lock, incidente ou degradação em andamento;
- Vercel instável;
- pressão para executar repair sem evidência;
- necessidade de alterar produção fora da autorização aprovada.

## 11. Segurança operacional

- usar cofre e credenciais temporárias;
- nunca usar `service_role` em navegador ou comando registrado;
- desativar histórico do shell ou usar prompt seguro para segredos;
- nunca salvar tokens em `.env`, `config.toml`, commits ou comentários;
- manter backups criptografados fora do repositório;
- não publicar dumps ou saídas com PII;
- sanitizar logs antes de anexar evidências;
- não conectar produção ao GitHub Actions;
- não usar `pull_request_target` ou secrets de produção na CI;
- manter Deploy to production desabilitado antes, durante e depois;
- remover vínculo/credencial local do posto de operação ao final.

## 12. Registro da execução futura

O relatório futuro deve conter somente:

- data, janela e responsáveis por função;
- commit e versão da CLI;
- histórico sanitizado antes/depois;
- checksum dos backups, sem caminho privado;
- confirmação do restore test;
- resultado do dry-run;
- duração da migration;
- contagens agregadas antes/depois;
- matriz por papel;
- fingerprints das seis funções;
- resultado de RLS, policies e grants;
- status da Vercel;
- decisão de encerrar ou reverter;
- confirmação de ausência de secrets e PII.

## 13. Referências

- [Supabase — Database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [Supabase CLI — migration repair](https://supabase.com/docs/reference/cli/supabase-migration-repair)
- [Supabase — Database backups](https://supabase.com/docs/guides/platform/backups)
- `docs/issue-43-local-validation.md`
- `docs/authorization-model.md`
- `supabase/tests/admin_authorization_catalog.sql`
- `supabase/tests/admin_authorization_matrix.sql`
- `supabase/tests/admin_authorization_pre_migration_fixture.sql`
