# Ativos oficiais da marca VERAH

Este inventário registra a origem, a preparação e o uso dos ativos oficiais. As seis variações transparentes são derivadas exclusivamente das artes fornecidas pela VERAH; não houve redesenho, troca tipográfica ou criação de símbolo.

## Auditoria das fontes

| Fonte | Dimensão | Transparência | Área útil aproximada | Observação |
| --- | ---: | --- | ---: | --- |
| `public/brand/logo-dark.png` | 1360 × 356 | Não | 51,1% | Assinatura clara sobre retângulo `#2B2B2B`, com margens amplas |
| `public/brand/logo-light.png` | 1360 × 356 | Não | 51,1% | Assinatura escura sobre fundo branco, com margens amplas |
| `public/brand/icon.png` | 400 × 400 | Não | 62,8% | Símbolo oficial sobre fundo branco |
| `public/brand/logo-animated.gif` | 1360 × 356 | Não | variável | Primeiro quadro vazio; reservado como fonte histórica |
| `public/brand/icon-animated.gif` | 400 × 400 | Não | variável | Animação oficial, não usada em navegação permanente |

Os arquivos opacos permanecem no repositório como fontes oficiais de referência, mas não devem ser usados diretamente na interface. O script `scripts/prepare-brand-assets.py` remove apenas o fundo plano, preserva as cores e proporções da arte e aplica recorte justo com 4 px de respiro.

## Variações transparentes

| Arquivo | Dimensão | Uso |
| --- | ---: | --- |
| `public/brand/verah-symbol-light.png` | 294 × 249 | Símbolo claro em fundo escuro |
| `public/brand/verah-symbol-dark.png` | 294 × 249 | Símbolo escuro em fundo claro |
| `public/brand/verah-wordmark-light.png` | 919 × 249 | Símbolo + VERAH, sem assinatura, em fundo escuro |
| `public/brand/verah-wordmark-dark.png` | 919 × 249 | Símbolo + VERAH, sem assinatura, em fundo claro |
| `public/brand/verah-signature-light.png` | 1031 × 251 | Marca completa e assinatura em fundo escuro |
| `public/brand/verah-signature-dark.png` | 1031 × 251 | Marca completa e assinatura em fundo claro |

Todos possuem canal alfa real, fundo totalmente transparente fora da arte e proporção original preservada. `app/icon.png` e `app/apple-icon.png` são derivados do símbolo escuro transparente, centralizado em uma tela quadrada.

## Componente oficial

Use `VerahLogo` de `components/brand/verah-logo.tsx`:

- `kind="symbol" | "wordmark" | "signature"` define a composição.
- `tone="light"` é para fundo escuro; `tone="dark"` é para fundo claro.
- `size="sm" | "md" | "lg"` preserva proporção e tamanhos consistentes.
- `priority` é reservado à marca visível na primeira dobra.

No desktop, shells e logins usam o wordmark. Em espaços móveis compactos, os shells usam o símbolo. A assinatura completa fica reservada a momentos institucionais e não aparece repetidamente na operação.

## Regras de aplicação

- Não esticar, comprimir, recolorir, aplicar filtros, rotacionar ou recriar a marca.
- Não adicionar fundo opaco ao arquivo transparente.
- Não duplicar “VERAH” ao lado do wordmark.
- Não usar a assinatura completa em menus compactos.
- Não usar GIF em cabeçalhos, sidebars ou navegação.
- Não usar o mockup institucional como se fosse uma tela real do produto.
- Em links com marca decorativa (`alt=""`), fornecer um nome acessível no próprio link.

## Movimento

`VerahBrandLoader` utiliza o símbolo transparente com uma pulsação discreta em CSS. Em `prefers-reduced-motion: reduce`, a animação é removida. Os GIFs oficiais permanecem arquivados e não são carregados pelo produto.
