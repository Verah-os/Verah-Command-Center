# Handoff — Issue #152 (Phase 0 component evaluation)

- **Issue / PR:** #152 / draft PR (branch `feat/control-plane-152-component-evaluation`)
- **Files changed:** `docs/architecture/decisions/008-control-plane-phase0-component-evaluation.md`, `pocs/omniroute/poc_omniroute_routing.py`, `pocs/omniroute/out/omniroute-evaluation.json`, `pocs/cognee/poc_cognee_memory.py`, `pocs/cognee/mock_llm.py`, `pocs/agency-agents/poc_agency_agents_roles.py`, `pocs/agency-agents/out/squad-v1-catalog.{json,md}`, `samples/context-packs/*.md`, `.gitignore`
- **Behavior delivered:** Phase-0 evaluation of OmniRoute, Cognee and agency-agents with reproducible sandbox POCs and a per-component `ADOPT | TRIAL | HOLD | REJECT` matrix (result: TRIAL for all three, gates documented in ADR 008).
- **Focused tests:** `python pocs/agency-agents/poc_agency_agents_roles.py` → PASS; `python pocs/cognee/poc_cognee_memory.py` followed by `python pocs/cognee/poc_cognee_memory.py --skip-ingest` (`.venv-eval`) → PASS (precision 1.0, persisted cross-process retrieval without re-ingestion); `python pocs/omniroute/poc_omniroute_routing.py` → FAIL by design (upstream combo-matrix: 15 pass / 12 fail at snapshot `63e4afa`, core fallback scenarios red — recorded as the TRIAL gate).
- **Required checks:** none required beyond POC runs; POC artifacts are reproducible scripts, no CI coupling added.
- **Invariant/decision discovered:** Cognee probes the LLM endpoint even for ingestion (force `COGNEE_SKIP_CONNECTION_TEST=true`, `CACHING=false`, tracing off, loopback-only endpoints and supported root directories under `.poc-cache/cognee`); its first import may download the public tiktoken vocabulary into `.poc-cache/tiktoken`, but no LLM/embedding provider is contacted; agency-agents roles must stay metadata-only (`reviewStatus: pending-review`, `model/executor: null`) until human review.
- **Remaining blocker/risk:** OmniRoute fallback contract is unstable at snapshot `63e4afa` (`priority: falls back…` returns 502 instead of 200); re-evaluate against a snapshot with green combo-matrix before adopting. Cognee's default `cognify` route requires a real LLM — pilot with the deterministic chunk pipeline first.

## Next session
Open the next Issue Context Pack (#148 / #149 / #150). Do not inherit this session's full narrative unless a listed invariant/blocker requires it.
