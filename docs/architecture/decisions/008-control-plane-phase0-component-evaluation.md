# ADR 008 — AI Control Plane Phase 0: avaliação de OmniRoute, Cognee e agency-agents

- Status: proposto para validação
- Data: 2026-08-31
- Issue: #152 (Parent: #147)
- POCs: `pocs/omniroute/`, `pocs/cognee/`, `pocs/agency-agents/`

## Contexto

A Fase 0 avalia três componentes antes de construir internamente capacidades
equivalentes. Toda a execução foi local/sandbox, sem credenciais reais
versionadas ou logadas, sem deploy/migration/pagamento/mensagem real. Conteúdo
de memória e prompts de terceiros foi tratado como dado não confiável até
revisão.

## Decisões por componente

### OmniRoute — TRIAL

- Upstream: `diegosouzapw/OmniRoute` (MIT), snapshot pinado
  `63e4afa3217abaacd29f85c6701064671925764b` (v3.8.51, 2026-08-31).
- Execução local validada: `npm ci` + suíte combo-matrix (fetch mockado,
  sem tráfego de provedores reais).
- Roteamento: 15+ estratégias (priority, fill-first, quota-aware, reset-aware,
  headroom, lkgp, DRR, weighted, cost-optimized, context-optimized, fusion,
  p2c, random/strict-random, round-robin, least-used). Contrato de failover
  documentado: apenas erros transitórios, ≤3 tentativas por provider
  (`OMNIROUTE_ROUTING_POLICY.md`, `OMNIROUTE_PROVIDER_FAILOVER.md`).
- Fallback/429: o handoff de quota (context-relay) dispara corretamente e
  registra `expiresAt` na janela de reset — cenário central para #148/#149.
  Porém, **15/27 testes do combo-matrix falham no snapshot pinado**,
  incluindo o caso canônico `priority: falls back to the next target when
  the first fails` (502 em vez de 200), `lkgp`, `reset-aware` e `headroom`.
  Os testes de distribuição mostram ruído estatístico; os de fallback
  canônico indicam regressão ou sensibilidade ambiental no snapshot.
- Overhead: ~736 ms médios por requisição no modo local (SQLite + guardrails
  + logging estruturado), com 100/100 respostas 200 em bench de 100
  requisições. Observabilidade rica (traces de combo, guardrails pré-call:
  vision/audio/video bridge, pii-masker, prompt-injection, credential-masker).
- Conflito com o Control Plane: nenhum — roteia modelos/provedores, não
  itens de trabalho. É complementar ao roteamento de trabalho do #148.
- Gate de TRIAL: adotar somente através de adapter interno (interface de
  roteamento VERAH), pinar snapshot cujo combo-matrix esteja verde para os
  cenários de fallback canônicos, e re-medir overhead no deployment alvo.

### Cognee — TRIAL

- Upstream: `topoteretes/cognee` (Apache-2.0), versão pinada `1.5.3`.
- Ingestão validada com 2 Context Packs/ADR/handoff em dataset dedicado
  (`verah-context-packs`), sem LLM real: pipeline determinístico
  `classify_documents → extract_chunks_from_documents → add_data_points`
  (espelha a rota não-LLM da própria biblioteca). A rota padrão `cognify`
  exige LLM — dependência dura registrada como achado.
- Recuperação por agente diferente em sessão nova: **precisão 1.0 (3/3
  queries)** com `CHUNKS_LEXICAL`, incluindo segunda execução do POC em
  processo separado (persistência cross-session confirmada).
- Provenance/TTL: API de datasets permite listar e deletar (supersession por
  delete); não existe TTL nativo — a política de TTL/supersession deve viver
  no adapter. Tarefa `record_provenance` existe mas é opt-in.
- A memória não substitui estado canônico: GitHub/Supabase seguem como fonte
  de verdade; o adapter deve tratar Cognee como cache semântico somente
  leitura de artefatos curados.
- Gate de TRIAL: pilotar com o pipeline determinístico (sem extração de
  grafo) antes de investir na rota com LLM; medir relevância com embeddings
  reais no piloto.

### agency-agents — TRIAL

- Upstream: `msitarzewski/agency-agents` (MIT), rev
  `3c9588880b7cafaec325a104899fd8bbe27e7d72`.
- Estrutura/licença revisadas: 258 papéis em 20 divisões, licença MIT
  confirmada, catálogo com frontmatter (name/description) + ferramenta de
  originalidade (`scripts/check-agent-originality.sh`).
- Seleção: **11 papéis** (limite 8–12) mapeados 1:1 ao squad v1 candidato —
  Software Architect, Backend Architect, Frontend Developer, Application
  Security Engineer, Test Automation Engineer, Product Manager, UX
  Researcher, UI Designer, Brand Guardian, Research Synthesist, Technical
  Writer. Nenhum candidato ficou sem correspondência.
- Adapter: catálogo metadata-only (`pocs/agency-agents/out/squad-v1-catalog.json`):
  cada registro carrega `verahRole`, descrição, caminho upstream, rev e
  sha256 como âncora de revisão, com `reviewStatus: pending` e
  `model/executor: null` — papel é dado; modelo e executor continuam
  decisões de runtime. Nenhum corpo de prompt de terceiro foi copiado.
- Gate de TRIAL: revisão humana dos 11 papéis antes de qualquer adoção em
  `AGENTS.md`/squad runtime.

## Matriz de decisão

| Componente | Valor | Complexidade op. | Custo | Segurança | Portabilidade | Maturidade | Lock-in | Fallback | Código próprio evitado | Decisão |
|---|---|---|---|---|---|---|---|---|---|---|
| OmniRoute | alto | média-alta (gateway Next.js, ~736ms/req local) | baixo (MIT, self-host) | boa (guardrails, chaves em vault local) | média (Node, adaptável) | alta atividade; snapshot atual com testes de fallback falhando | baixo | **instável no snapshot** | alto (router + quota + failover + observabilidade) | **TRIAL** |
| Cognee | médio-alto | média (Python, SQLite/LanceDB/Kuzu) | baixo (Apache-2.0) | boa com adapter (sem memória sem revisão) | boa | ativa; rota padrão exige LLM | baixo-médio | ingestão/retrieve OK offline; grafo exige LLM | médio (memória compartilhada + retrieval) | **TRIAL** |
| agency-agents | médio | baixa (arquivos MD) | zero | exige revisão antes do uso | total | catálogo amplo (258 papéis) | zero | n/a | médio (catálogo curado de especialidades) | **TRIAL** |

## Consequências

- Nenhum componente é instalado/acoplado ao runtime nesta fase; tudo via
  adapter ou catálogo curado.
- Os resultados alimentam #148 (contrato de fundação), #149 (executor
  OpenHands com fallback) e #150 (roteamento Langflow) e evitam duplicação
  de infraestrutura de roteamento/memória/papéis.
