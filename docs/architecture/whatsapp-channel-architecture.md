# Arquitetura do canal WhatsApp

## Fluxo resumido

```text
Cliente
→ WhatsApp
→ webhook validado e idempotente
→ comandos privados da Plataforma VERAH
→ banco de dados
→ fila do Concierge
→ prestador
→ retorno para a cliente
```

## Princípios arquiteturais

- WhatsApp é um canal.
- App é um canal.
- O domínio e o banco de dados da Plataforma VERAH são a fonte da verdade.
- Nenhum canal mantém regras de negócio ou estado operacional paralelos.
- n8n fica fora do caminho crítico.
- IA não altera estados críticos.
- Mensagens externas são idempotentes.
- Arquivos são privados.
- Decisões financeiras são transacionais e auditáveis.

## Fronteiras de responsabilidade

### WhatsApp

Recebe e entrega mensagens. Não decide autorização, etapa do atendimento,
prestador, orçamento ou conclusão.

### Webhook

Valida a autenticidade da chamada, protege contra replay, persiste cada
mensagem uma única vez e encaminha comandos estreitos ao domínio.

### Plataforma VERAH

Resolve identidade, autorização, consentimento, propriedade do veículo,
transições de estado e audiência. Toda ação relevante registra ator, data,
canal, origem, evidência e identificador idempotente quando aplicável.

### Banco de dados

Mantém o estado canônico da jornada e aplica integridade, autorização por papel,
RLS e transações.

### n8n

Orquestra entrega eventual, lembretes, retries, dead-letter e alertas. Sua
indisponibilidade não pode impedir a criação de um atendimento nem autorizar
ações críticas.

### IA

Pode estruturar relatos, resumir, classificar, identificar lacunas e sugerir
hipóteses. Toda sugestão preserva incerteza e origem e depende de revisão
humana.

## Segurança e privacidade

- Credenciais de integração permanecem exclusivamente no servidor.
- A cliente acessa apenas seus próprios dados.
- O prestador recebe somente o necessário para executar o serviço.
- Telefone, identidade direta, notas internas e histórico não necessário não
  são expostos ao prestador.
- Fotos e vídeos ficam em armazenamento privado com acesso temporário e
  autorizado.
- Aprovações financeiras validam identidade, revisão, valor, validade e
  idempotência dentro de uma única transação.

## Resiliência

O recebimento confirma somente depois da validação e persistência mínima. A
entrega externa usa outbox, retry controlado e dead-letter. Reentregas não
duplicam cliente, mensagem, veículo, atendimento, evento ou decisão.
