# CRM Clientes V1 — #235 / #231

## Contratos e autorização

Leitura administrativa no Command Center, via `requireRole(["admin"])` em cada entrada de serviço e cliente Supabase SSR com cookies e chave anon existente. RLS permanece ativa. Middleware e políticas não mudam; concierge conserva seu portal atual e não ganha acesso administrativo. Sem cache compartilhado entre sessões, mutations, RPCs ou banco CRM paralelo.

| Superfície       | Fonte canônica           | Projeção / vínculo                                                                               |
| ---------------- | ------------------------ | ------------------------------------------------------------------------------------------------ |
| Lista e cadastro | `customers`              | id, display_name, created_at; não confundir id com auth user                                     |
| Contato/pesquisa | `customer_channels`      | WhatsApp ligado por customer_id; endereço e consentimento; app channel/auth IDs omitidos         |
| Veículos         | `customer_vehicles`      | customer_id exato; marca, modelo, ano, placa, km, ativo                                          |
| Solicitações     | `service_requests`       | customer_id exato; vehicle_id só ligado a veículo da mesma ficha                                 |
| Histórico        | `service_request_events` | IDs das solicitações autorizadas; tipo, papel, canal, data; sem payload ou conteúdo de mensagens |

Contratos RLS existentes: `20260730153004_secure_customer_identity.sql`, `20260802013920_alpha_intelligent_intake_foundation.sql` e `20260731022348_alpha_communication_intake_foundation.sql`. Nenhuma nova migration.

Não inferir identidade por nome/telefone, nem associar solicitação pelo criador (pode ser concierge). Registros legados sem customer_id não são reatribuídos; a ficha explica essa limitação. O vínculo de autenticação permanece intacto. Sem exposição de ranking, margem, secrets, identidade de login ou payloads de prestadores.

## Indicadores

- Cadastrados: contagem exata de `customers` autorizados.
- Novos: created_at no mês corrente UTC, início inclusivo e próximo mês exclusivo. Fuso indicado no painel; datas operacionais exibidas em America/Sao_Paulo.
- Ativos: clientes distintos com customer_id não nulo em solicitações nas etapas canônicas solicitado, concierge_aceitou, prestador_indicado, aguardando_aprovacao ou em_execucao. Não persiste estado de cliente; concluido/cancelado excluídos.
- Veículos: contagem exata de todos os registros autorizados, incluindo inativos.
- Solicitações abertas: mesmas etapas acima, incluindo solicitações ainda sem customer_id; essas não contam como cliente ativa.
- Última interação: evento operacional mais recente entre solicitações vinculadas; informa papel/canal e que não comprova contato humano. Sem eventos, não derivar de updated_at.

## Falhas e limites

Cada fonte tem estado available/unavailable. Fonte sem permissão, ausente, erro de transporte, count nulo ou dados inválidos nunca vira zero. Clientes ausentes/inacessíveis produzem a mesma resposta de não encontrado. Fontes opcionais falham independentemente; contato indisponível restringe busca a nome com aviso explícito.

Leituras completas paginadas em blocos de 200, avançando pelo tamanho retornado e conferindo count exact, duplicatas e alterações na contagem. Limite V1: 5.000 registros por fonte; acima disso fica indisponível, sem KPI parcial. História consulta IDs em lotes de 50 e só aparece se todos os lotes forem confirmados, com limite agregado de 5.000. São leituras separadas, não um snapshot transacional; mudanças simultâneas sem alteração na contagem podem exigir recarregar a página.

Busca literal no servidor após leitura autorizada, sem interpolar texto do usuário em filtros PostgREST; nome sem acentos e contato normalizado. Máximo 120 caracteres e 25 clientes por página. Nenhum dataset completo enviado a componente cliente. História apresenta os 50 eventos mais recentes, com total explícito.

## Human Gates e convivência

PRs #233 e #234 revisadas antes das alterações: zero arquivos em comum. Branch baseada na main, sem incorporar nenhuma delas. Sem mudanças em mobile, middleware, site institucional, schema, migrations ou scripts de banco.

Sem banco remoto/repair, produção, acesso ou rotação de secrets, pagamentos, mensagens reais, signing ou publicação Apple/Google. Orçamentos, planos, pagamentos e documentos ficam explicitamente fora da ficha V1. Link para atendimento existente conserva os gates daquele fluxo. Nenhuma ação operacional nova.

Se uma fonte não estiver disponível no Alpha, a ação humana mínima é verificar implantação do contrato e permissões existentes em ambiente autorizado. Não aplicar migrations, reparar histórico ou contornar RLS como parte desta issue. `vercel.json` desativa deploy automático somente de `feat/235-canonical-customer-crm`, preservando as demais branches conforme a [configuração oficial](https://vercel.com/docs/project-configuration/git-configuration).

## Validação

Testes executam queries com simulador PostgREST somente leitura e cobrem autorização antes de consultar, identidades distintas, registros sem vínculo, isolamento da ficha, métricas, falhas parciais, limites, busca e eventos. CI existente também valida RLS em banco isolado do runner. Nenhuma fixture é inserida no backend da aplicação.

Validação local: `pnpm ci:application` aprovado (292 testes, typecheck, lint e build). Avisos preexistentes de Wrench não utilizado e Supabase/Edge mantidos. UI real renderizada em harness externo ao repositório, com serviços substituídos por fixtures de teste explicitamente identificadas: lista, pesquisa sem resultados, erro de fonte e detalhe; 375px e 1440px sem overflow observado. Esse teste visual não substitui a validação de dados reais do Alpha, que permanece sujeita ao ambiente e aos Human Gates. Ambiente local Node 24.18.0 / pnpm 9.15.9; CI usa Node 22.17.1.
