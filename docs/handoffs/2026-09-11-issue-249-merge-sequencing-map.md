# Handoff — Issue #249 (Merge Sequencing Map)

- **Issue / PR:** #249 / (this Draft PR) — fixes #249.
- **Commit:** `HEAD` desta branch (docs + static test, nenhum merge).
- **Files changed:** `docs/ship-verah/release-1.0-merge-sequencing.md`,
  `docs/handoffs/2026-09-11-issue-249-merge-sequencing-map.md`,
  `tests/release-1.0-merge-sequencing-references.test.mjs`.
- **Behavior delivered:** mapa determinístico de integração/merge para as 7 Draft PRs
  `#236/#239/#240/#242/#244/#246/#248` — matriz por PR, overlap de arquivos (zero pairwise),
  overlap semântico, ordem recomendada `#236 → #239 → #240 → #242 → #244 → #246 → #248`,
  revalidação por passo, gates pós-merge (V1–V5), Human Gates (H1–H7) e stop/rollback fail-closed.

- **Focused tests:** `node --experimental-strip-types --test tests/release-1.0-merge-sequencing-references.test.mjs` — estático, sem rede/sem deps.

- **Required checks:** CI desta PR (`Application`, `Database authorization`, `Mobile workspace`,
  `Required`) deve ficar verde; nenhum outro check novo., docs-only + teste estático isolado..
- **Invariant/decision discovered:** zero arquivo overlap entre as 7 Draft PRs
  (31 paths únicos); `#236/#240` estão `behind` (base `c8692247`, falta rebase para
  `d391782`); ordem canônica preserva backend/identidade/`customer_id`/ownership/
  `service_request`/mileage/fuel/charging(L+kWh separados)/expenses/maintenance/documents/RLS/auth..
- **Remaining blocker/risk:** merge propriamente dito **não** é executado por esta issue
  (requer humano + gates H1–H7); qualquer PR que regrida CI ou mude contrato canônico

  dispara a stop rule (Seção 8 do doc..)
- **Codex usage:** n/d.