# ADR 001 — Identidade de cliente independente do canal

- Status: aceito para implementação incremental
- Data: 2026-07-30
- Issue: #52

## Contexto

O modelo atual identifica a cliente principalmente por `auth.users` e repete
nome e telefone no atendimento. Essa estrutura atende ao portal autenticado,
mas não representa com segurança uma pessoa que inicia a jornada por um canal
como WhatsApp e ainda não possui login.

A identidade da cliente precisa existir independentemente do canal, enquanto
o App e o WhatsApp permanecem meios de acesso à mesma jornada registrada pela
Plataforma VERAH.

## Decisão

A primeira etapa cria somente a fundação estrutural:

- `public.customers` representa a identidade canônica da cliente;
- `customers.auth_user_id` permite um vínculo opcional com `auth.users`;
- `public.customer_channels` associa endereços de canal à identidade;
- o endereço de WhatsApp é armazenado no formato canônico E.164;
- uma conta autenticada pertence a no máximo uma cliente;
- o mesmo endereço canônico de um canal pertence a no máximo uma cliente;
- cada cliente pode ter no máximo um canal primário de cada tipo;
- a remoção de uma conta autenticada preserva a identidade da cliente;
- a remoção de uma cliente remove seus canais associados.

O modelo inicial aceita os canais `app` e `whatsapp`. O consentimento possui
apenas os estados mínimos `unknown`, `granted` e `revoked`, com um timestamp
opcional para registrar quando o estado foi atualizado.

## Schema desta etapa

### `customers`

- `id`: identificador UUID;
- `auth_user_id`: vínculo opcional e único com `auth.users`;
- `display_name`: nome de exibição não vazio;
- `created_at` e `updated_at`: timestamps com fuso horário.

### `customer_channels`

- `id`: identificador UUID;
- `customer_id`: vínculo obrigatório com `customers`;
- `channel_type`: `app` ou `whatsapp`;
- `channel_address`: identificador canônico do canal;
- `is_primary`: indica o canal preferencial daquele tipo;
- `consent_status`: estado mínimo do consentimento;
- `consent_updated_at`: data opcional da última alteração do consentimento;
- `created_at` e `updated_at`: timestamps com fuso horário.

## Integridade mínima

As chaves estrangeiras preservam a identidade quando `auth.users` é removido e
eliminam canais órfãos quando uma cliente é removida. Índices únicos impedem
duplicidade de conta autenticada, endereço de canal e canal primário por tipo.
O índice da chave estrangeira de `customer_channels` mantém eficientes as
consultas e exclusões por cliente.

Para WhatsApp, `channel_address` deve estar previamente normalizado e obedecer
ao formato E.164. A normalização em si não pertence a esta etapa.

## Segurança e comandos da segunda etapa

RLS permanece habilitada nas duas tabelas. Cliente autenticada lê apenas sua
identidade e seus canais; Concierge e Admin possuem leitura operacional;
Provider e `anon` não recebem acesso. Nenhum papel autenticado recebe escrita
direta nas tabelas.

As escritas são concentradas nos seguintes comandos:

- `private.current_customer_id()` resolve somente a identidade da cliente
  autenticada;
- `public.ensure_current_customer(display_name text)` cria ou retorna de forma
  idempotente a identidade da cliente autenticada;
- `public.resolve_or_create_whatsapp_customer(text, text)` normaliza o telefone,
  valida E.164 e cria ou retorna a identidade pelo canal WhatsApp;
- `public.set_whatsapp_consent(uuid, text)` registra consentimento ou opt-out no
  canal WhatsApp primário.

O resolvedor de WhatsApp é restrito a `service_role`. O consentimento pode ser
registrado pela própria cliente em sua identidade ou por `service_role`.
Funções com `security definer` validam o ator dentro do banco, usam
`search_path` vazio e não retornam o telefone.

Locks transacionais por identidade, combinados com índices únicos, impedem
duplicidade em chamadas concorrentes. As funções têm execução revogada de
`PUBLIC`, `anon` e papéis não necessários, com grants explícitos.

## Fora destas etapas

Esta decisão não adiciona `customer_id` a `service_requests` ou
`customer_vehicles`, não altera `owner_id` e não implementa:

- backfill;
- serviços, backend, frontend ou DTOs;
- webhook ou integração com WhatsApp;
- mesclagem automática de identidades conflitantes.

A resolução e criação idempotente pelos comandos acima não representa merge
automático de identidades conflitantes. A migration administrativa da
Issue #43 continua sendo um gate separado para produção.

## Consequências

O domínio passa a ter uma base estável e uma API de banco estreita para
desvincular identidade e canal sem alterar os fluxos existentes. Nenhum
registro anterior é migrado.

As próximas etapas devem adicionar os vínculos graduais com veículos e
atendimentos em migrations separadas.
