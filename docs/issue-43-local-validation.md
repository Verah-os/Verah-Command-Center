# Validação local da autorização administrativa

## Escopo

A migration `20260727225432_secure_admin_authorization.sql` foi validada em
PostgreSQL local do Supabase, executado em Docker Desktop. O banco começou
vazio, recebeu todas as migrations anteriores em ordem e usou somente dados
sintéticos.

Nenhum projeto remoto, dado real ou credencial de produção foi acessado.

## Ambiente

- Windows 11 com WSL 2;
- Docker Desktop 4.84.0;
- Docker Engine 29.6.2;
- Supabase CLI 2.110.0;
- PostgreSQL 17.6 da imagem oficial local do Supabase.

Somente o container PostgreSQL foi necessário para os testes.

## Resultado

- 25 migrations anteriores aplicadas em banco limpo;
- migration alvo aplicada sem erro em transação única;
- reaplicação acidental testada sem erro;
- RLS permaneceu ativa nas quatro tabelas administrativas;
- grants anônimos ou excessivos não permaneceram;
- as seis funções privilegiadas recusaram Customer, Concierge, Provider e
  usuário autenticado sem perfil;
- Admin manteve leitura, escrita permitida e execução das seis funções;
- fluxos normais de Cliente, Concierge e Prestador continuaram acessíveis
  conforme o vínculo do perfil;
- papel inválido foi recusado e perfil ausente falhou de forma fechada;
- contagens das oito tabelas verificadas permaneceram idênticas antes e
  depois da migration;
- políticas necessárias de atendimentos e veículos continuaram presentes;
- lint do schema local não encontrou erros.

Os testes administrativos executam dentro de uma transação finalizada com
`ROLLBACK`, portanto as mutações de teste não permanecem no banco.

## Falha encontrada e correção

O PostgreSQL local oficial não expõe o helper `auth.jwt()` usado inicialmente
nas seis funções. A migration foi ajustada para ler o papel técnico das claims
assinadas disponibilizadas pela sessão do PostgREST, mantendo o papel
operacional em `user_profiles` como fonte de verdade. A matriz completa passou
depois da correção.

## Restauração

Foi criado um dump lógico imediatamente antes da migration. A restauração dos
schemas afetados em um banco local novo recuperou as contagens e as políticas
anteriores. Uma reversão em ambiente hospedado deve ser feita por migration
revisada ou restauração administrada, nunca por alteração manual em produção.

## Verificações da aplicação

- testes Node: 9 aprovados;
- TypeScript: aprovado;
- lint: aprovado, com um aviso preexistente fora deste escopo;
- build de produção do Next.js: aprovado.

## Riscos restantes

- alterações de política e grants adquirem locks de catálogo por um intervalo
  curto; no teste local a aplicação inicial levou menos de meio segundo;
- os quatro avisos do advisor sobre `search_path` pertencem a funções antigas,
  fora das seis funções endurecidas por esta migration;
- a implantação deve seguir o fluxo aprovado de staging/produção, com backup,
  janela observada e plano de reversão.
