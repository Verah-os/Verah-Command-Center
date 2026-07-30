# VERAH Intelligence Engine — VIE

## Propósito

O VERAH Intelligence Engine é a camada de inteligência assistida da VERAH.

Ele organiza dados internos, consulta conhecimento externo, gera hipóteses e
apoia decisões humanas.

Não realiza diagnóstico autônomo nem toma decisões operacionais críticas.

## Módulos conceituais

### Diagnosis Engine

Cruza veículo, sintomas, condições, histórico, recorrências e evidências para
produzir hipóteses ordenadas.

### History Engine

Constrói o histórico técnico do veículo ao longo do tempo.

### Risk Engine

Identifica sinais de risco e situações que exigem interrupção de uso, guincho
ou avaliação urgente, sempre com escalonamento humano.

### Maintenance Engine

Analisa quilometragem, tempo, histórico e recomendações do fabricante para
apoiar manutenção preventiva.

### Parts Engine

Relaciona peças propostas, peças utilizadas, fabricante, custo, garantia,
durabilidade e reincidência.

### Cost Engine

Compara valores históricos, complexidade, região, veículo e serviço, sem
substituir orçamento formal.

### Provider Intelligence

Avalia prazo, qualidade, preço, garantia, retorno, reincidência, avaliações e
resolução real por prestador.

### Learning Engine

Compara:

```text
sintoma inicial
→ hipótese
→ diagnóstico confirmado
→ serviço executado
→ peça utilizada
→ resultado
→ reincidência
```

## Fontes futuras

Classificar fontes por confiabilidade:

### Nível 1 — oficial

- recalls;
- manuais;
- boletins técnicos;
- documentação do fabricante;
- órgãos oficiais.

### Nível 2 — técnica validada

- literatura automotiva;
- bases técnicas;
- materiais de fabricantes de peças;
- casos confirmados pela VERAH.

### Nível 3 — evidência comunitária

- fóruns;
- vídeos;
- comentários;
- relatos públicos.

Conteúdo comunitário nunca deve ser tratado isoladamente como diagnóstico
confirmado.

## Formato de saída

O VIE deve apresentar:

- hipóteses;
- probabilidade ou nível de confiança;
- evidências favoráveis;
- evidências contrárias;
- informações ausentes;
- fontes consultadas;
- nível de confiabilidade das fontes;
- recomendação de próximo passo;
- necessidade de revisão humana.

## Restrições

O VIE não pode:

- inventar fontes;
- esconder incerteza;
- transformar correlação em diagnóstico;
- apresentar estimativas como fatos;
- aprovar serviços;
- autorizar gastos;
- garantir segurança;
- substituir avaliação profissional.
