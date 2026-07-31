# CI e testes automatizados por papel

## Objetivo

A pipeline valida a aplicação e a autorização no banco antes de integrações na
`main`. Todo teste de banco roda em containers locais e descartáveis, usando
somente fixtures sintéticas. Nenhum job conhece o projeto Supabase remoto ou
recebe credenciais de produção.

## Arquitetura

O workflow `CI` é executado em pull requests para `main`, pushes na `main` e
execuções manuais. Duas trilhas rodam em paralelo:

- `CI / Application`: instalação pelo lockfile, testes Node, typecheck, lint e
  build Next.js;
- `CI / Database authorization`: replay de migrations, matriz SQL por papel,
  catálogo de RLS, funções privilegiadas e schema lint;
- `CI / Required`: depende das duas trilhas e falha se alguma falhar, for
  cancelada ou não terminar com sucesso.

Execuções antigas do mesmo pull request ou branch são canceladas. Execuções de
branches diferentes não interferem entre si.

## Versões

- Ubuntu 24.04 no runner;
- Node.js 22.17.1;
- pnpm 9.15.9;
- Supabase CLI 2.110.0;
- PostgreSQL 17 no ambiente local do Supabase.

As GitHub Actions externas são referenciadas por SHA completo e imutável.

## Checks da aplicação

O comando abaixo concentra os checks para evitar divergência entre CI e
desenvolvimento local:

```bash
pnpm ci:application
```

Ele executa, nesta ordem:

```text
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

## Checks do banco

O comando reproduzível é:

```bash
pnpm ci:database
```

O script:

1. inicia somente um banco Supabase local via Docker;
2. valida que o container pertence ao projeto local isolado da CI;
3. restaura um banco limpo até a migration `20260716000000`;
4. aplica `admin_authorization_pre_migration_fixture.sql`;
5. aplica a migration administrativa e qualquer migration posterior;
6. confere que todas as migrations locais estão registradas;
7. executa `admin_authorization_catalog.sql`;
8. executa `rls_catalog.sql`;
9. executa `admin_authorization_matrix.sql`;
10. executa `customer_identity_security.sql`;
11. executa `communication_intake_security.sql`;
12. executa `control_plane_dry_run.sql`;
13. executa duas resoluções concorrentes e valida o resultado com
    `customer_identity_concurrency.sql`;
14. executa o schema lint;
15. faz um segundo replay completo de todas as migrations desde zero;
16. repete catálogo, RLS, identidade de cliente, comunicação, Control Plane, concorrência e
    schema lint;
17. remove containers e volumes locais mesmo quando algum passo falha.

O arquivo `supabase/seed.sql` nunca é aplicado na CI. Todos os resets usam
obrigatoriamente `--no-seed`.

### Cobertura por papel

A matriz atual verifica:

- Customer não acessa recursos administrativos e mantém seu fluxo normal;
- Concierge não acessa recursos administrativos e mantém seu fluxo normal;
- Provider não acessa recursos administrativos e mantém seu fluxo normal;
- usuário autenticado sem perfil falha de forma fechada;
- papel fora do domínio aceito é recusado;
- Admin mantém o acesso esperado;
- `anon` não executa nenhuma das seis funções privilegiadas;
- as seis funções recusam atores autenticados que não sejam Admin;
- grants administrativos continuam mínimos;
- as políticas essenciais de atendimento e veículos permanecem presentes;
- Customer lê somente sua identidade e seus canais;
- Concierge e Admin leem identidades e canais para operação;
- Provider e `anon` não acessam identidades ou canais de clientes;
- RPCs de identidade mantêm grants mínimos, validação E.164 e idempotência;
- duas sessões concorrentes resolvem o mesmo telefone para uma única cliente;
- mensagens inbound e outbound são idempotentes e exigem os papéis previstos;
- conversas, mensagens, eventos e anexos respeitam a audiência de cada papel;
- eventos são imutáveis e o bucket de anexos permanece privado;
- o Control Plane aceita somente `service_role`, deduplica deliveries, respeita lock e budget e não declara efeitos externos;
- contagens das fixtures não mudam durante a migration.

`rls_catalog.sql` mantém a lista explícita de todas as tabelas públicas da
aplicação. Uma nova tabela pública faz o teste falhar até que sua presença e
RLS sejam revisadas.

O catálogo atual contém 17 tabelas públicas distintas, incluindo as fundações
de identidade e comunicação. A auditoria das
migrations mostrou que `dispatcher_jobs` é criada de forma defensiva em dois
arquivos, o que explica a contagem anterior de 11 ocorrências sem representar
uma décima primeira tabela. O teste compara tanto a lista nominal quanto a
contagem real do catálogo PostgreSQL e exige RLS nas 17 tabelas existentes.

## Schema lint

O comando usa:

```bash
supabase db lint --local --schema public,private --level warning --fail-on error
```

Erros bloqueiam a CI. Warnings são registrados no log, mas ainda não bloqueiam.
A execução local atual não reporta warnings. Versões anteriores da validação
registraram avisos de `search_path` em funções antigas; caso reapareçam, ficam
visíveis no log e devem ser tratados em uma mudança dedicada.

## Reprodução local

Pré-requisitos:

- Docker Desktop ou outro daemon Docker compatível;
- Supabase CLI 2.110.0;
- Node.js 22.17.1;
- pnpm 9.15.9;
- Bash. No Windows, use WSL 2 ou Git Bash para o teste de banco.

Execute:

```bash
pnpm install --frozen-lockfile
pnpm ci:application
pnpm ci:database
```

Os comandos SQL usam o `psql` existente dentro do próprio container local. O
script não aceita URL de banco e não possui caminho de conexão remota.

## Diagnóstico de falhas

- falha em `pnpm install`: confirme Node, pnpm e integridade do lockfile;
- falha em testes Node: examine o primeiro contrato de autorização reportado;
- falha no build: reproduza com `pnpm build` sem variáveis de produção;
- falha ao iniciar o banco: confirme que Docker está ativo e que as portas
  `54320` e `54322` estão livres;
- falha em migration: o log indica o primeiro arquivo SQL que não aplicou;
- falha na matriz: a exceção identifica o papel ou privilégio que regrediu;
- falha em `rls_catalog.sql`: revise a existência e o estado de RLS de todas as
  tabelas públicas;
- falha no schema lint: corrija erros; warnings, se houver, permanecem
  informativos nesta etapa.

No Node 22, o teste de `services/auth/access.ts` usa o strip de tipos nativo.
O aviso experimental emitido pelo runtime é informativo e não altera o
resultado do teste.

O cleanup usa `trap` e remove apenas o projeto local
`verah-command-center-ci`. Nenhum dump, volume ou artefato do banco é enviado ao
GitHub.

## Pull requests de forks

O workflow usa o evento `pull_request`, permissões somente de leitura e nenhum
secret. Não é usado `pull_request_target`. Assim, código de forks não recebe
credenciais e executa apenas contra o banco descartável criado pelo próprio
job. A primeira execução de um colaborador externo ainda pode depender da
aprovação padrão configurada no GitHub.

## Ausência de acesso remoto

A pipeline não executa `supabase link`, `supabase db push`, migration repair,
`psql` remoto ou qualquer comando de deployment. Ela não usa
`SUPABASE_ACCESS_TOKEN`, project ref, senha remota ou secrets de ambiente.

O controle GitHub Integration → Deploy to production é independente desta
pipeline e permanece desabilitado. O workflow não lê nem altera essa
configuração.

## Proteção futura da main

Após o workflow registrar seus primeiros checks, a proteção da `main` deve
exigir o check estável:

```text
CI / Required
```

A configuração de branch protection ou ruleset não faz parte deste PR.

## Limitações atuais

- os testes Node validam contratos de código, não uma sessão HTTP completa;
- a matriz SQL cobre as fronteiras de autorização existentes, mas não é uma
  suíte E2E de interface;
- warnings antigos de `search_path` ainda não bloqueiam;
- o primeiro job de banco pode ser mais lento por baixar imagens Docker;
- alterações deliberadas nas tabelas públicas ou assinaturas privilegiadas
  exigem atualização explícita dos contratos SQL.
