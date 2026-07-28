# Modelo de autorização

## Fonte de verdade

A identidade é validada pelo Supabase Auth no servidor. O papel operacional vem de um perfil controlado no banco e não pode ser escolhido ou alterado pelo próprio usuário.

Papéis atuais:

- Customer: jornada própria da Cliente;
- Concierge: operação de atendimento;
- Provider: atendimentos vinculados ao prestador do perfil;
- Admin: Command Center e operações administrativas;
- acesso técnico: somente por credencial de servidor mantida fora do navegador.

## Defesa em profundidade

As superfícies administrativas usam três camadas complementares:

1. redirecionamento de rota por sessão e papel;
2. guard obrigatório nas Server Actions;
3. grants mínimos, RLS e validação de papel nas funções privilegiadas do banco.

Esconder links ou confiar em parâmetros do navegador não concede acesso.

## Concessão e revogação de Admin

O papel Admin deve ser concedido ou revogado somente por um operador autorizado, em canal administrativo auditável. Não existe cadastro self-service de Admin e a aplicação cliente não possui permissão para alterar papéis.

Após uma mudança de papel:

1. revogar ou encerrar as sessões ativas do usuário;
2. confirmar o perfil no banco por canal privado;
3. exigir novo login;
4. executar a matriz de acesso antes de liberar a conta.

Não registrar e-mails, tokens ou outros dados pessoais em commits, issues ou logs.

## Matriz resumida

| Superfície | Customer | Concierge | Provider | Admin |
| --- | --- | --- | --- | --- |
| Portal próprio | permitir | permitir | permitir | conforme suporte explícito |
| Operação do Concierge | negar | permitir | negar | permitir |
| Atendimento do Provider | negar | negar | permitir quando atribuído | suporte explícito |
| Command Center administrativo | negar | negar | negar | permitir |

## Validação

Toda mudança de autorização deve incluir:

- teste positivo do papel autorizado;
- testes negativos dos demais papéis e de sessão inválida;
- teste contra manipulação de parâmetros;
- verificação de grants, RLS e funções privilegiadas;
- build e typecheck;
- aplicação inicial somente em ambiente isolado.

## Rollback

O rollback deve ser feito por migration revisada, restaurando definições anteriores sem desabilitar RLS nem remover dados. Produção não deve receber alterações manuais fora do fluxo aprovado.

## Riscos e limitações restantes

- A migration precisa ser aplicada e validada primeiro em um ambiente isolado com contas de teste para todos os papéis.
- Alterações de papel exigem encerramento das sessões existentes e nova autenticação.
- Credenciais técnicas continuam sendo um recurso privilegiado e devem permanecer restritas ao servidor e ao cofre do ambiente.
- A matriz deve ser revalidada sempre que uma nova rota, Server Action, tabela ou função privilegiada for adicionada.
