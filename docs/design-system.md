# VERAH Design System

O design system VERAH é a base visual compartilhada dos portais da Cliente, do Concierge e do Prestador. A referência oficial é o projeto **VERAH 2.0** no Figma Make; os tokens abaixo são a fonte de verdade no código.

## Princípios

- humano, premium e acolhedor, sem estética automotiva agressiva;
- fundo escuro com superfícies bem delimitadas e alta legibilidade;
- rosa como marca e ação primária;
- verde exclusivamente para sucesso e confirmação;
- vermelho exclusivamente para erro, ação destrutiva e criticidade;
- estados operacionais de atenção podem usar âmbar ou laranja;
- foco sempre visível e alvos interativos com pelo menos 44 px.

## Tokens oficiais

| Token | Valor | Uso |
| --- | --- | --- |
| `--verah-pink` | `#E8B6C0` | marca, links e ação primária |
| `--verah-background` | `#232323` | canvas dos portais |
| `--verah-card` | `#2E2E2E` | cards, cabeçalhos e diálogos |
| `--verah-secondary` | `#3A3A3A` | controles e superfícies secundárias |
| `--verah-sidebar` | `#1A1A1A` | navegação persistente |
| `--verah-white` | `#FFFFFF` | texto principal |
| `--verah-muted` | `#9A9A9A` | texto secundário |
| `--verah-success` | `#31C48D` | sucesso confirmado |
| `--verah-danger` | `#EF4444` | erro e ação destrutiva |
| `--verah-border` | `rgba(255,255,255,.10)` | borda padrão |
| `--verah-border-strong` | `rgba(255,255,255,.18)` | borda em interação |
| `--verah-radius-card` | `20px` | cards e painéis |
| `--verah-radius-button` | `16px` | botões e controles |

Os componentes devem consumir os aliases semânticos (`background`, `card`, `muted`, `primary`, `success`, `danger`) configurados no Tailwind. Não usar uma cor pelo nome de outro papel: por exemplo, verde não substitui `primary`.

## Tipografia

Poppins é carregada com `next/font` nos pesos 300, 400, 500, 600 e 700. A hierarquia recomendada é:

- título de página: 30–36 px, peso 600;
- título de seção: 20–24 px, peso 600;
- corpo: 14–16 px, peso 400;
- apoio e metadados: 12–14 px, peso 400 ou 500;
- ação: 14 px, peso 600.

## Componentes compartilhados

- `Button`: variantes `primary`, `secondary`, `ghost` e `danger`;
- `Input`, `Select`, `Textarea`, `Checkbox` e `Radio`: controles escuros, foco rosa e estado desabilitado;
- `Card`: superfície elevada com raio de 20 px;
- `Badge` e `Alert`: base neutra extensível por estado operacional;
- `Dialog`: diálogo nativo com backdrop escuro;
- `Tabs` e `Navigation`: navegação reutilizável e responsiva;
- `Timeline`: trilho semântico para eventos cronológicos;
- `EmptyState`, `ErrorState`, `LoadingState` e `Skeleton`: estados de interface consistentes.

## Aplicação por portal

`verah-surface`, `concierge-surface` e `provider-surface` compartilham o mesmo canvas e os mesmos tokens. Cada portal preserva sua arquitetura e linguagem operacional, mas marca, tipografia, foco, cards, formulários e ações permanecem consistentes.

O Command Center administrativo não recebeu redesign estrutural. Ele apenas passou a consumir os tokens e componentes fundamentais compartilhados.

## Acessibilidade e responsividade

- contraste de texto principal branco sobre superfícies escuras;
- foco rosa de 2 px com afastamento de 3 px;
- navegação por teclado em links, botões e controles;
- mensagens de erro com `role="alert"` e sucesso com `role="status"`;
- preferência por movimento reduzido respeitada;
- layouts fluidos, sem largura fixa nas áreas de conteúdo, validados a partir de 320 px.

## Exceções auditadas

Vermelho, verde, âmbar e laranja continuam permitidos em badges e alertas operacionais existentes. Uma camada temporária de compatibilidade em `app/globals.css` traduz classes cromáticas legadas para tokens VERAH sem alterar o markup de regras de negócio. Novos componentes não devem depender dessa camada.

Não há tokens nem estilos vinculados a stages, cálculos, autenticação ou permissões. O design system é estritamente visual.
