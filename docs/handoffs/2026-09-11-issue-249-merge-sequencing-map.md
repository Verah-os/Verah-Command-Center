# Handoff — Issue #249 (Merge Sequencing Map)

- **Issue / PR:** #249 / (this Draft PR #250) — fixes #249.
- **Commit:** `HEAD` desta branch (rebaseado sobre `main` `c71ec30`; docs + static test, nenhum merge).
- **Files changed:** `docs/ship-verah/release-1.0-merge-sequencing.md`,
  `docs/handoffs/2026-09-11-issue-249-merge-sequencing-map.md`,
  `tests/release-1.0-merge-sequencing-references.test.mjs`.
- **Behavior delivered:** mapa canônico de integração/merge reconciliado com o estado real em 2026-09-12:
  as 7 Drafts originais (`#236/#239/#240/#242/#244/#246/#248`) **já mergearam na `main`**
  (`c71ec30`, junto de `#256`); o conjunto **vivo** de Drafts abertas é agora `#250/#254/#255/#258` —
  matriz por PR aberta + contexto mergeado (8 PRs, 93 paths únicos, zero pairwise overlap),
  overlap semântico, ordem recomendada `#250 → #254 → #255 → #258`,
  revalidação por passo, gates pós-merge (V1–V5), Human Gates (H1–H7) e stop/rollback fail-closed.

- **Reconciliação:** reavaliei changed-file collisions e dependências das Drafts abertas via GitHub API:
  `#250` (3 paths,, esta PR, rebaseada na `main`), `#254` (8 paths,, UX copy/a11y pack;),
  `#255` (46 paths,, Design System V1 retint,, sem F5/F6), `#258` (3 paths,, delta de refresh do mapa;;
  o conteúdo deste mapa canônico agora subsume em grande parte o delta da #258,, sem editar os arquivos dela)) —
  zero file overlap entre todos os pares;; todas `behind` mas `clean`, CI `Required` ⇒ `success` em todas..
- **Focused tests:** `node --experimental-strip-types --test tests/release-1.0-merge-sequencing-references.test.mjs` — estático,, sem rede/sem deps..

- **Required checks:** CI desta PR (`Application`, `Database authorization`, `Mobile workspace`,
  `Required`) deve ficar verde;; nenhum outro check novo., docs-only + teste estático isolado..
- **Invariant/decision discovered:** zero arquivo overlap entre o conjunto vivo (`#250/#254/#255/#258`,
  60 paths únicos) e o contexto mergeado (`#236/#239/#240/#242/#244/#246/#248/#256`,
  33 paths únicos) — 93 paths únicos totais, interseção vazia; todas as 4 Drafts abertas
  estão `behind` (base desatualizada,, sem `conflict`); `#255` não implementa F5/F6
  (diff é só troca de tokens de cor,, mantendo a11y do pack #254 aberto/blocked até #255 landed);;
  ordem canônica preserva backend/identidade/`customer_id`/ownership/
  `service_request`/mileage/fuel/charging(L+kWh separados)/expenses/maintenance/documents/RLS/auth..
- **Remaining blocker/risk:** merge propriamente dito **não** é executado por esta issue
  (requer humano + gates H1–H7); `#254/#255/#258` seguem pendentes de rebase sobre a `main`
  `c71ec30` (CI já verde,, sem conflito textual previsto); F5/F6 do pack #254 seguem
  blocked por ownership até #255 landed;; qualquer PR que regrida CI ou mude contrato canônico

  dispara a stop rule ((Seção 8 do doc..)
- **Codex usage:** n/d..
