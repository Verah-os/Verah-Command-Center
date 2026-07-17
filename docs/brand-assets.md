# Ativos oficiais da marca VERAH

Este documento registra os ativos oficiais incorporados ao produto e as regras para seu uso. As artes devem ser consumidas pelos caminhos abaixo, sem recoloração, distorção, recorte ou recriação manual.

## Inventário

| Arquivo no projeto | Origem oficial | Uso permitido |
| --- | --- | --- |
| `public/brand/logo-light.png` | `verah_logo_clara.png` | Arte escura para superfícies claras |
| `public/brand/logo-dark.png` | `verah_logo_escura.png` | Arte clara para superfícies escuras |
| `public/brand/icon.png` | `verah_icone.png` | Favicon, app icon e espaços compactos |
| `public/brand/logo-animated.gif` | `verah_logo_animado.gif` | Aberturas ou carregamentos explícitos e controlados |
| `public/brand/icon-animated.gif` | `verah_icone_animado.gif` | Loader explícito e controlado |
| `public/brand/app-mockup.jpg` | `verah_app_mockup.jpg` | Material institucional; não usar como tela real do produto |
| `docs/brand/verah-app-mockup.pptx` | `verah_app_mockup.pptx` | Referência editável da marca, fora da interface |
| `docs/brand/verah-icon-animation.html` | `verah_icon_animation.html` | Referência técnica; não executar no runtime da aplicação |

`app/icon.png` e `app/apple-icon.png` são cópias exatas do ícone oficial para os metadados gerados pelo Next.js.

## Componente oficial

Use `VerahLogo` de `components/brand/verah-logo.tsx` em vez de escrever “VERAH” como substituto visual.

- `variant="light"`: arte clara para fundo escuro.
- `variant="dark"`: arte escura para fundo claro.
- `variant="icon"`: uso compacto.
- `size="sm" | "md" | "lg"`: tamanhos predefinidos com proporção preservada.
- `priority`: somente para marcas visíveis na primeira dobra.

Os nomes dos arquivos mantêm o mapeamento solicitado. Como as artes oficiais possuem fundo opaco, as variantes do componente descrevem a cor da marca em primeiro plano e selecionam o arquivo que oferece o contraste visual correto.

## Regras de aplicação

- Fundo escuro: `variant="light"`.
- Fundo claro: `variant="dark"`.
- Espaço reduzido: `variant="icon"`.
- Não esticar, comprimir, recortar, recolorir ou aplicar filtros.
- Não duplicar o texto “VERAH” ao lado da marca completa.
- Não usar GIF em cabeçalhos, sidebars, menus ou outros elementos permanentes.
- Não usar o mockup institucional como se fosse uma tela funcional do produto.

## Movimento reduzido

`VerahBrandLoader` usa o ícone animado apenas quando o componente é renderizado em um estado de carregamento explícito. Com `prefers-reduced-motion: reduce`, o navegador seleciona `icon.png` antes de carregar o GIF. Nenhum GIF é usado na navegação permanente.
