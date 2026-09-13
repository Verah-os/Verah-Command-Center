# SHIP VERAH — plano mestre executável (Issue #164)

Atualizado em 2026-09-12. Escopo estritamente NÃO-produção.

Fonte operacional: GitHub (`main`, Issues/PRs/checks). Este documento resume o estado
atual e aponta para os artefatos versionados de aceitação/readiness; não substitui o
backend canônico, os runbooks ou os Human Gates.

## Estado executivo atual

A implementação repository-safe do **Release 1.0 — VERAH Free** está consolidada na
`main` para M1–M3. As 11 capacidades do escopo do #164 estão implementadas sobre os
contratos canônicos e foram cobertas pela auditoria de aceitação em
`docs/ship-verah/release-1.0-acceptance-audit.md`.

Desde essa auditoria, o ciclo adicionou e integrou preparação de build/distribuição,
smoke/readiness, reconciliação de integração e hardening de segurança. O ponto de
parada deliberado é o **Human Gate de aplicação/validação das migrations no Supabase
não-produtivo**. Enquanto esse gate estiver pendente, o ciclo pode continuar somente
com trabalho independente repository-safe.

### Regra de prioridade

1. Não reabrir features já entregues em M1–M3.
2. Não criar backend, identidade, veículo, `service_request` ou state machine paralelos.
3. Corrigir somente regressões P0/P1 comprovadas ou gaps repository-safe novos.
4. Manter migrations remotas, produção, secrets, pagamentos/mensagens reais, signing,
   App IDs/packages irreversíveis e publicação bloqueados por Human Gate.
5. Não promover backlog estratégico para Release 1.0 sem evidência de bloqueio real.

## Invariante permanente — Web × Mobile parity

Desde 2026-09-13, a paridade Web × Mobile é invariante permanente do produto
(ADR `docs/architecture/decisions/010-web-mobile-parity.md`).

- VERAH é UM produto multichannel: Web e Mobile são canais do mesmo backend,
  domínio, identidade, ownership, dados e regras de negócio canônicas.
- Toda funcionabilidade aplicável aos dois canais deve existir em ambos.
  Divergência funcional, lógica de domínio duplicada, históricos separados e
  modelos de dados incompatíveis NÃO são permitidos.
- Uma feature não está DONE apenas porque funciona no Mobile ou na Web.
  Definition of Done multichannel = Backend + Web + Mobile + testes +
  consistência cross-channel.
- Toda Issue/feature futura precisa classificar: Backend obrigatório?
  Web obrigatório? Mobile obrigatório? Se Web ou Mobile for N/A, justificar.
- Funcionalidade legítima apenas de plataforma (câmera, biometria,
  notificações nativas, integrações de SO) é documentada como
  `INTENTIONAL PLATFORM-SPECIFIC` em vez de gerar equivalente artificial.

Matriz Release 1.0 Web × Mobile: ver ADR 010. Status atual: todas as
capacidades Release 1.0 passaram na auditoria inicial de paridade ou são
documentadas como platform-specific; ver `docs/ship-verah/release-1.0-parity-audit.md`.

## Invariantes obrigatórios

- **Backend canônico:** Supabase e contratos versionados permanecem fonte da verdade.
- **Identidade:** auth provider é método de acesso; `customer_id`/identidade canônica
  permanece o domínio da cliente.
- **Ownership:** `customer_vehicles` e demais dados da cliente continuam protegidos por
  RLS/RPCs canônicos, sem inserts paralelos ou ownership implícito.
- **Atendimento:** `service_requests` é o atendimento canônico; mobile/cliente,
  Concierge e Prestador projetam o mesmo registro autorizado.
- **Quilometragem:** logs preservam regras de ownership e não regressão.
- **Combustível/energia:** litros/km/L e kWh/km/kWh permanecem semanticamente separados.
- **Despesas:** custo por km deriva dos contratos canônicos, sem ledger paralelo.
- **Manutenção:** histórico/lembretes reutilizam registros canônicos; previsão não vira
  diagnóstico automático.
- **Documentos:** storage/metadados permanecem privados e owner-based.
- **Auth/RLS:** nenhuma UI substitui autorização server-side; falhas devem ser
  fail-closed.
- **Demo/sintético:** nunca apresentado como produção ou dado real.

## Marcos Release 1.0

### M1 — VERAH no celular

**Estado: PASS repository-safe.**

Entregue:
- workspace mobile Expo/React Native versionado e verificável;
- login/cadastro e sessão persistida;
- Google OAuth no cliente, mantendo configuração externa como gate separado;
- onboarding canônico;
- garagem com múltiplos veículos e operações de veículo preservando histórico;
- catálogo/FIPE e fallback compatível com a arquitetura aprovada;
- configuração EAS non-prod preparada sem executar signing/publicação.

Validação física/externa continua condicionada aos Human Gates correspondentes.

### M2 — VERAH útil

**Estado: PASS repository-safe.**

Entregue:
- quilometragem;
- abastecimentos e consumo;
- despesas e custo por km;
- dashboard "Quanto meu carro me custa?";
- manutenções;
- lembretes por data/km sem depender de push real;
- documentos/notas/histórico;
- ownership/RLS/testes de segurança associados.

### M3 — VERAH resolve

**Estado: PASS repository-safe.**

Entregue:
- CTA `Preciso de ajuda` ligado ao `service_request` canônico;
- fila operacional real do Concierge;
- portal Prestador projetando o mesmo atendimento quando autorizado;
- tracking/estado derivados da fonte canônica, sem segunda máquina de estados;
- jornada multi-dispositivo baseada no backend, não no aparelho;
- segregação entre rotas reais e `/demo/*` sintético.

### M4 — distribuição

**Estado: PREPARADO até Human Gates.**

Artefatos principais:
- `docs/ship-verah/release-1.0-build-readiness-checklist.md`;
- `docs/ship-verah/release-1.0-android-physical-smoke.md`;
- `docs/ship-verah/release-1.0-ios-readiness.md`;
- `docs/ship-verah/release-1.0-m4-distribution-readiness.md`.

A configuração versionada já evita prompts desnecessários de versão de build e deixa
metadados/checklists de loja preparados. Não executar neste ciclo:
- criação irreversível de App ID/bundle/package de produção;
- signing/certificados;
- TestFlight/Play Console submission;
- publicação Apple/Google.

## Gate ativo conhecido — Supabase não-produção

A preparação repository-safe da sequência de migrations e o hardening de segurança
foram concluídos e versionados. O estado remoto **não deve ser inferido pelo GitHub**.

Até ação humana explícita:
- não executar `db push`, `migration repair`, reset ou reconciliation remota;
- não marcar migration repository-only como aplicada;
- não alterar produção;
- não tentar contornar o bloqueio por outro ambiente/projeto.

Referências:
- `docs/ship-verah/release-1.0-staging-migrations-runbook.md`;
- `docs/ship-verah/release-1.0-staging-advisor-audit.md`;
- migration de hardening versionada e ainda repository-only conforme documentação.

## Trabalho permitido enquanto o gate estiver bloqueado

Somente itens independentes e repository-safe, por exemplo:
- correções P0/P1 comprovadas em código já existente;
- testes unitários/contratuais/CI;
- lint/typecheck/build local/CI;
- UX e acessibilidade que não criem arquitetura paralela;
- documentação/runbooks/checklists;
- preparação não-produtiva de build que não exija signing ou identificador irreversível;
- limpeza de backlog obsoleto com evidência de supersession/conclusão.

Antes de abrir PR, verificar PRs Draft abertas e evitar colisão de branch/arquivos.

## Fora do Release 1.0

Continuam deliberadamente fora do caminho crítico, salvo regressão que prove o
contrário:
- Vehicle Health/Score e pesquisa veicular ampla;
- OCR/Invoice Intelligence;
- VERAH Pro;
- Passaporte ampliado/transferível;
- rede homologada em escala;
- pagamentos/split reais e assinaturas;
- WhatsApp outbound real/campanhas;
- automações avançadas e AI Factory;
- CRM expandido e demais backlog estratégico.

Esses itens permanecem no backlog para descoberta/priorização posterior e não devem
impedir a primeira validação do Release 1.0.

## Próxima sequência após o Human Gate de staging

Quando a ação humana de migrations não-produtivas for concluída e validada:

1. confirmar schema/migrations/RLS no staging com o runbook versionado;
2. executar smoke Android físico contra o ambiente não-produtivo;
3. corrigir apenas P0/P1 encontrados e revalidar CI;
4. executar readiness/smoke iOS permitido pelo ambiente;
5. congelar o candidate do Release 1.0;
6. avançar para gates humanos de distribuição/beta sem tocar produção implicitamente;
7. iniciar coorte pequena do Pilot Alpha somente com os gates operacionais aplicáveis.

## Critério de conclusão técnica do ciclo repository-safe

O ciclo repository-safe está concluído quando:
- M1–M3 permanecem verdes e sem regressão conhecida;
- todos os checks obrigatórios do candidate estão verdes;
- não existe GAP de código Release 1.0 independente do gate remoto;
- documentação de build, smoke, rollback/readiness e distribuição está consistente;
- os únicos próximos passos restantes são Human Gates explícitos ou validação física que
  dependa desses gates.

## Segurança — permanece inalterada

- nunca armazenar service role, secrets ou credenciais privadas no app/GitHub/logs;
- nenhuma migration remota sem autorização humana explícita;
- nenhum pagamento/mensagem real;
- nenhuma operação destrutiva;
- nenhum bypass de CI/review/RLS/branch protection;
- nenhuma submissão/publicação Apple/Google implícita;
- Human Gates permanecem fail-closed.
