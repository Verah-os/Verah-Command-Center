# Direção visual VERAH

## Princípio

A interface deve transmitir acolhimento, clareza e confiança em movimento. A marca é o ponto de partida: nós representam pessoas e etapas; conexões representam acompanhamento; percursos incompletos deixam claro que existe um próximo passo. O resultado deve parecer humano e proprietário, sem adotar uma estética automotiva agressiva.

## Sistema gráfico

- **Nós:** pontos circulares rosa indicam marcos, decisões e estados da jornada.
- **Conexões:** linhas finas ligam informações relacionadas sem competir com o conteúdo.
- **Percursos:** arcos incompletos sugerem continuidade; nunca devem formar um novo logotipo.
- **Divisores de jornada:** uma linha sutil com dois marcos pode separar blocos longos.
- **Densidade:** no máximo um motivo de destaque por área principal. Formulários e listas operacionais permanecem limpos.

O componente `VerahNetworkMotif` é decorativo, usa `aria-hidden` e herda a cor rosa oficial. Ele aparece de forma moderada nos logins e no acolhimento da cliente. O divisor `.verah-route-divider` organiza transições entre blocos.

## Aplicação da marca

- Fundo escuro: arte `light`.
- Fundo claro: arte `dark`.
- Desktop e logins: wordmark sem tagline.
- Navegação móvel: símbolo.
- Assinatura completa: apenas em contexto institucional com espaço suficiente.
- Área de respiro: preservar o recorte transparente; não encostar controles na arte.

## Hierarquia das telas

- **Login:** marca, contexto do acesso, campos e ação principal. O motivo gráfico fica ao fundo e nunca atravessa texto ou controles.
- **Cliente:** linguagem acolhedora, próximo passo claro e continuidade da jornada.
- **Concierge:** marca discreta, identidade da central e navegação operacional com item ativo visível.
- **Prestador:** marca, identidade do portal e foco nos atendimentos.
- **Admin:** wordmark no shell amplo e símbolo no cabeçalho compacto, mantendo a densidade técnica necessária.

## Microcopy

A linguagem deve explicar o próximo passo com serenidade e evitar termos internos quando a pessoa não precisa deles.

- Cliente: “Cuidado para o seu veículo. Clareza para você.”
- Jornada: “Do primeiro relato ao cuidado concluído, a VERAH conecta cada próximo passo.”
- Concierge: “Acolher, organizar e acompanhar cada jornada com cuidado.”
- Estados vazios: explicar o que aparecerá ali e oferecer uma ação objetiva.
- Erros de acesso: informar o problema sem revelar dados sensíveis.

## Movimento e acessibilidade

- Movimento é restrito ao loader, com pulsação lenta e sem deslocamento de layout.
- `prefers-reduced-motion: reduce` remove a animação.
- Motivos decorativos não recebem foco nem nome acessível.
- Marcas dentro de links usam `aria-label` no link e `alt=""` nas imagens duplicadas por breakpoint.
- Itens ativos usam cor, fundo e `aria-current="page"`; o reconhecimento não depende apenas de cor.
- Foco permanece visível, áreas clicáveis têm altura mínima de 44 px e não há informação essencial apenas em imagens.

## Originalidade e origem

Os logotipos e símbolos foram derivados das artes oficiais fornecidas pela VERAH. O sistema auxiliar de linhas, nós e percursos foi criado para o produto com formas geométricas simples e não incorpora ilustração, fonte, ícone ou ativo visual de terceiros.

## Guardrails

- Não alterar regras, dados, autenticação ou ciclo de vida para atender uma necessidade visual.
- Não criar novo símbolo, lettering ou assinatura.
- Não usar o sistema gráfico como decoração repetitiva em todos os cards.
- Não substituir sinais funcionais de status por elementos puramente decorativos.
- Não reduzir contraste para aproximar a interface de um mockup.
