# MVP-010 — roteiro de teste manual

## Preparação

1. Aplique `supabase/migrations/20260716000000_create_customer_vehicles.sql` no projeto Supabase.
2. Entre com um usuário de perfil `customer`.
3. Confirme que o mesmo usuário não possui dados de demonstração criados automaticamente.

## Jornada principal

1. Abra `/demo/cliente/novo-atendimento`.
2. Selecione **Adicionar novo veículo** e informe um **VW Fox 2010**.
3. Preencha localização, relato e os demais campos obrigatórios; confirme o atendimento.
4. Confirme no banco que `service_requests.vehicle_id` aponta para um registro de `customer_vehicles` pertencente à cliente autenticada.
5. Abra `/demo/cliente/veiculo/[id]`, informe a quilometragem e salve.
6. Conclua o fluxo já existente: triagem, indicação, proposta, aprovação, execução e conclusão.
7. Inclua um texto de garantia na proposta.
8. Confirme que o atendimento aparece em `/demo/cliente/historico` e a garantia em `/demo/cliente/garantias`.
9. Abra outro atendimento e escolha o veículo já cadastrado.
10. Confirme que não foi criado um veículo duplicado e que o novo atendimento reutilizou o mesmo `vehicle_id`.

## Segurança e compatibilidade

1. Com outra cliente, tente abrir `/demo/cliente/veiculo/[id]` usando o ID do primeiro usuário; a rota deve responder como não encontrada.
2. Tente enviar manualmente um `vehicle_id` pertencente a outra cliente; a validação do servidor e a policy RLS devem impedir o vínculo.
3. Confirme que Concierge e Prestador não conseguem consultar `customer_vehicles` diretamente.
4. Confirme que Admin consegue consultar os veículos, sem permissão de alteração por esta migration.
5. Abra um atendimento antigo, sem `vehicle_id`; o detalhe deve continuar usando marca, modelo, ano e placa históricos.
6. Em todas as telas da cliente, confirme que não aparecem nome, contato, documento ou endereço do prestador.
7. Confirme que a placa aparece mascarada fora dos formulários que realmente precisam do valor completo.

## Responsividade

Verifique painel, navegação, veículo, histórico, garantias e novo atendimento em 320 px, 375 px, tablet e desktop, sem rolagem horizontal.
