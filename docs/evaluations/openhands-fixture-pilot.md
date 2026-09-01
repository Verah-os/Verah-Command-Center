# Piloto integration-safe — OpenHands fallback

- Data: 2026-09-01
- Issue: #149
- Escopo: tarefa isolada `OpenHands fallback executor`, sem serviço externo,
  credenciais, rede, produção ou efeitos reais.

| Métrica | Baseline Codex fixture | OpenHands fixture |
|---|---:|---:|
| Resultado | completed | completed |
| Tentativas/retrabalho | 1 / 0 | 1 / 0 |
| Custo sintético | 42 microunits | 55 microunits |
| Duração do executor | não registrada no baseline | 37 ms (clock fixture) |
| Checks focados | 8/8 | 7/7 |
| Efeitos externos | 0 | 0 |

O piloto prova paridade contratual e observabilidade, não desempenho nem custo
real do fornecedor. A medição real depende de transporte OpenHands dentro do
ambiente isolado descrito no runbook; não deve ser feita no host atual porque
o modo headless oficial executa ações com aprovação automática.
