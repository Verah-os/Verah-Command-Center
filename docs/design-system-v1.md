# VERAH Design System V1

A base visual compartilhada de VERAH para Web e Mobile. A referência oficial é a experiência mobile VERAH aprovada: fundo claro/branco, hero grafite/preto, rosa suave como cor de ação e estado ativo, cards claros, tipografia limpa e navegação simples. Web e Mobile compartilham a mesma identidade e hierarquia de UX e os mesmos tokens; cada plataforma adapta a navegação responsivamente.

## Princípios

- humano, premium e acolhedor, sem estética automotiva agressiva;
- base clara (`#FBF8F6`) para conteúdo; hero e blocos de alto contraste em grafite/preto (`#232323`);
- rosa suave/nude para CTA primária, links, estados ativos e badges;
- cards brancos/claros com espaçamento e raio consistentes;

- tipografia simples e forte; hierarquia 30–36 px título / 20–24 px seção / 14–16 px corpo /  ​​12–14 px apoio /
- foco sempre visível, alvos interativos com pelo menos 44 px;
- verde para sucesso confirmado, vermelho para erro/destrutivo выплат, âmbar/laranja para atenção operacional;


## Tokens oficiaiais (light - Web e Mobile)

| Token | Valor | Uso |
| --- | --- | --- | --- |
| `--verah-canvas` | `#FBF8F6` | canvas claro de conteúdo |
| `--verah-ink` | `#232323` | grafite/preto: hero, títulos e áreas de alto contraste |
| `--verah-muted-ink` | `#655B5D` | texto secundário sobre claro |
| `--verah-accent` | `#814455` | rosa suave/nude escuro: CTA primária, estados ativos, badges, links |
| `--verah-rose` | `#E8B6C0` | rosa suave de marca (tintas, acentos, superfícies) |
| `--verah-nude` | `#F2E6E1` | superfície neutra adicional, muted |
| `--verah-card-light` | `#FFFFFF` | cards e superfícies elevadas |
| `--verah-line` | `#DFD2CD` | bordas padrão |
| `--verah-success` | `#31C48D` | sucesso confirmado |
| `--verah-danger` | `#EF4444` | erro e ação destrutiva |
| `--verah-radius-card` | `20px` | cards e painéis |
| `--verah-radius-button` | `16px` | botões e controles |

Os componentes devem consumir os aliases semânticos configurados no Tailwind (`background`, `card`, `muted`, `primary`/`accent`, `success`, `danger`, `rose`, `nude`, `canvas`, `ink`, `line`). Não usar uma cor pelo nome de outro papel: rosa não substitui `danger` etc.

## Superfícies e exceções escuras

- Superfícies institucionais claras: `design-system-light` (site público, demo cliente, Web mobile viewport) consomem os tokens claros acima.

- Autenticação e Command Center permanecem escuros pelo contrato de acessibilidade/auth já existente: `auth-surface`, `verah-surface`(área da cliente legada), `concierge-surface`, `provider-surface` e nav do Command mantêm canvas `#232323`, cards `#2E2E2E`, ação primária rosa `#E8B6C0` e texto branco. Nestas superfícies a cor de ação e estado ativo ém o rosa suave `#E8B6C0` (sobre escuro), nunca verede.

- No mobile nativo: telas light usam `#814455` para CTA/ativo e `#E8B6C0`/`#F2E6E1` e `#F5DCE1` para acentos/superfícies; onboarding/add-vehicle (canvas escuro) usa `#E8B6C0` como cor de ação.

## Tipografia

Poppins é carregada com `next/font` nos pesos 300, 400, 500, 600 e 700 (Web). Mobile nativo usa a família de sistema com pesos equivalentes. Hierarquia recomendada:

- título de página: 30–36 px, peso 600;
- título de seção: 20–24 px, peso 600;
- corpo: 14–16 px, peso 400;
- apoio e metadados: 12–14 px, peso 400 ou 500;
- ação: 14 px, peso 600.

## Componentes compartilhados

- `Button`: variantes `primary` (rosa `accent` no claro; no escuro rosa claro com texto grafite), `secondary`, `ghost` e `danger`;
- `Input`, `Select`, `Textarea`, `Checkbox` e `Radio`: controles claros com foco rosa (escuros nas superfícies autenticadas pelo contrato existente);
- `Card`: superfície branca/clara com raio de 20 px e borda `line`;
- `Badge` e `Alert`: base neutra extensível por estado operacional;

- `Dialog`: diálogo nativo com backdrop;
- `Tabs` e `Navigation`: navegação reutilizável e responsiva (bottom tabs no mobile, topo/horiz no web desktop);
- `Timeline`: trilho semântico para eventos cronológicos;

- `EmptyState`, `ErrorState`, `LoadingState` e `Skeleton`: estados de interface consistentes.

## Aplicação por plataforma

- **Web (autenticado produto)**: área da cliente e mockups institucionais consomem `design-system-light`, mesma paleta e hierarquia do mobile; Command Center administrativo e autenticação permanecem escuros, consumindo os mesmos tokens de marca (rosa sobre escuro) e a mesma tipografia/cards/foco.



- **Mobile (React Native)**: telas de cliente, histórico, quilometragem, abastecimento/energia, manutenção e documentos usam fundo claro com cards brancos e CTA rosa `#814455`; onboarding/adição de veículo (canvas escuro) usa rosa suave `#E8B6C0` como ação,. Como em Web, os estados operacionais rosa = atividade/ativo, verde = confirmação, vermelho = erro/critico...

## Acessibilidade e responsividade

- contraste legível: texto `ink` sobre canvas claro (e branco sobre grafite nos hero);
- foco rosa de 2 px com afastamento de 3 px;

- navegação por teclado em links, botões e controles (Web) e touch targets ≥ 44 px (mobile);
- mensagens de erro com `role="alert"` e sucesso com `role="status"`;
- preferência por movimento reduzido respeitada(`prefers-reduced-motion` no Web e plataformas no mobile);
- layouts fluidos, sem largura fixa nas áreas de conteúdo, validados a partir de 320 px;

## Exceções auditadas

Vermelho, verde, âmbar e laranja continuam permitidos em badges e alertas operacionais existentes. Uma camada temporária de compatibilidade em `app/globals.css` traduz classes cromáticas legadas para tokens VERAH sem alterar o markup de regras de negócio. Novos componentes não devem depender dessa camada. Não há tokens nem estilos vinculados a stages, cálculos, autenticação ou permissões.: o design system é estritamente visual.

## Representação no site público

O site público (`app/`, `home.module.css`, mockups em `app/demo/`) representa a UI real: mesma base clara, hero grafite/preto, CTA/badges rosa e cards claros. Qualquer mudança futura na UI real deve espelhar o mockup (e vice-versa) para manter a paridade já estabelecida.: o mockup não ém uma interface fictícia divergente..