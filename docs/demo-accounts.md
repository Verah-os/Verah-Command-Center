# Contas de demonstração por papel

## 1. Criar os usuários

No Supabase Dashboard, acesse **Authentication > Users > Add user** e crie quatro usuários com e-mail e senha: cliente, concierge, prestador e administrador. Marque o e-mail como confirmado para a demonstração.

Copie o UUID de cada usuário. Para o prestador, copie também o UUID correspondente em `public.service_providers`.

## 2. Vincular os perfis

Execute no SQL Editor, substituindo os valores entre `<...>`:

```sql
insert into public.user_profiles (user_id, role, display_name, provider_id)
values
  ('<UUID_CLIENTE>', 'customer', 'Cliente Demo', null),
  ('<UUID_CONCIERGE>', 'concierge', 'Concierge Demo', null),
  ('<UUID_PRESTADOR>', 'provider', 'Prestador Demo', '<UUID_SERVICE_PROVIDER>'),
  ('<UUID_ADMIN>', 'admin', 'Admin Demo', null)
on conflict (user_id) do update
set role = excluded.role,
    display_name = excluded.display_name,
    provider_id = excluded.provider_id,
    updated_at = now();
```

Para localizar o prestador cadastrado:

```sql
select id, name, city
from public.service_providers
where active = true
order by name;
```

## 3. Entradas da demonstração

- Cliente: `/entrar/cliente`
- Concierge: `/entrar/concierge`
- Prestador: `/entrar/prestador`
- Administrador: `/login`

O destino é definido pelo papel gravado em `user_profiles`, independentemente da página usada para entrar.

## 4. Placa de demonstração do onboarding

No onboarding do cliente (`/onboarding/cliente`), a placa `VRH1A23` (formato Mercosul) está mapeada para a fixture sintética local de Vehicle Intelligence (`verah_local_fixture`, veículo `DEMO-VEH-001`). Use-a para percorrer o fluxo de sugestão sintética; qualquer outra placa válida cai no cadastro manual. Os dados sugeridos são sempre marcados como sintéticos e exigem confirmação explícita do cliente.

## 5. Teste recomendado

Abra três navegadores ou perfis separados para cliente, concierge e prestador. Entre com uma conta em cada um e percorra a jornada completa. Use uma quarta janela para o administrador quando precisar inspecionar toda a operação.
