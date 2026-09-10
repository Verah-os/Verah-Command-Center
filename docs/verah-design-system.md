# VERAH Design System — institucional V1

Escopo: `/`, Issue #232. Preserva tokens globais e superfícies autenticadas.

- Cores locais: canvas `#fbf8f6`, superfície branca, nude `#f2e6e1`, rose oficial `#e8b6c0`, texto `#232323`, secundário `#655b5d`, destaque `#814455`. Rose recebe texto escuro; nunca branco em rose claro.
- Tipografia: Poppins já carregada pelo layout, sem nova fonte; títulos balanceados, peso 500/600, hero fluido 40–76px; corpo 16px ou mais, entrelinha 1.65.
- Grid: mobile primeiro; largura máxima 1200px, margens 24px; duas colunas a partir de 900px; passos em quatro colunas a partir de 1100px. Espaçamento 8/16/24/32/48/80/112px.
- CTAs: links nativos com destino explícito; primário escuro, secundário contornado, mínimo 48px; foco visível de 3px com offset; hover e active com contraste maior.
- Cards: superfícies sólidas, bordas sutis, radius 20px; destaque de produto com radius 32px e sombra `0 24px 64px #23232314`. Cards informativos não simulam botões.
- Estados: navegação nativa; demo identificada como sintética, disponibilidade do leva & traz qualificada. Sem simulação de atendimento real, métricas inventadas ou formulário sem destino.
- Motion: entrada curta de opacidade/transform, sem loop ou scroll hijacking; desativada com `prefers-reduced-motion`.
- Acessibilidade: skip link, landmarks, hierarquia h1/h2/h3, ícones decorativos ocultos, alvos de toque 44px+, reflow e zoom, links descritivos, imagens dimensionadas.
- Imagens: usar `public/brand/app-mockup.jpg`, ativo existente, com legenda de mockup ilustrativo e `next/image`; logos oficiais, SVGs Lucide consistentes. Não apresentar mockup como screenshot de produção.
- Conteúdo: resultado antes da tecnologia; problema → quatro passos → confiança → operação → produto → públicos → demo. Aprovação pertence à cliente; IA organiza informações, não diagnostica nem autoriza serviço.

## Referências e decisões

- [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill): consulta `automotive concierge premium trust --design-system`. Aproveitada a narrativa problema/jornada/solução e critérios de acessibilidade. Liquid Glass, dourado e fontes sugeridas não se adequam ao DNA VERAH; prevalecem superfícies sólidas, rose e Poppins existentes.
- [React Best Practices](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices): Server Component estático, sem efeitos, estado ou requisições na home; sem dependências adicionais; imagem responsiva e carregamento tardio abaixo da dobra.
- [Web Design Guidelines](https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines): auditar semântica, foco, motion, imagens, reflow e CTAs. Capitalização segue português brasileiro.
- Fixter: princípio de comunicar resultado e conveniência em poucos passos, conforme briefing da issue; sem reutilizar texto, layout ou identidade.

## Convivência

PRs abertas verificadas antes de implementar: #233 (mobile e banco), #151 (`.openhands/skills/repo.md`), #145 (`GEMINI.md`). Nenhum arquivo planejado em comum. Não modificar modelos, backend, banco, migrations, credenciais, pagamentos, mensagens, signing ou publicação.

## Auditoria da V1

- `app/page.tsx`: Web Design Guidelines e React Best Practices aplicadas; Server Component estático, metadados próprios, links nativos, skip link, hierarquia de títulos, imagens dimensionadas e mockup identificado. Nenhum fetch, estado cliente ou dependência nova.
- `app/home.module.css`: foco visível, sem transições globais, entrada de 650ms sem loop, reduced motion sem animações, grid responsivo e estilos restritos à home.
- Navegador local: sem overflow horizontal em 320, 375, 768 e 1024px; desktop 1440px; skip link por Tab/Enter com foco visível; imagens carregadas ao entrar no viewport; nenhum erro JS observado.
- Fluxo testado: Home → `/demo` → `/demo/cliente/piloto` → “Entrar na demonstração”, sem credenciais. O CTA “Preciso de ajuda” aponta à área autenticada existente; não inicia atendimento nem envia mensagens.
- Lighthouse mobile, build local: performance 96, acessibilidade 100, best practices 100, LCP 2,6s, CLS 0. Resultado pontual de laboratório, não medição de produção. A CLI gravou o relatório e depois encontrou EPERM ao remover seu perfil temporário no Windows.
- Testes: 284 aprovados, incluindo dois novos testes que executam o middleware com auth em memória para verificar acesso público exato e redirecionamentos das rotas protegidas. Typecheck, lint e build aprovados; permanecem avisos preexistentes de import não utilizado e Supabase/Edge.
- Ambiente local: Node 24.18.0, pnpm 9.15.9; CI usa as versões canônicas Node 22.17.1 e pnpm 9.15.9.
