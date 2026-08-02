# ADR 002 — Quote Intelligence Core

- Status: accepted for Alpha
- Date: 2026-08-02
- Rule version: `quoteability-alpha-1`
- Engine version: `quote-intelligence-1.0.0`

## Context

The existing VERAH quote flow persists itemized proposals, calculates totals in
the database and supports provider submission and customer approval. It does
not yet represent whether a case is directly quotable, requires inspection, is
an emergency, or depends on accessory compatibility. It also does not record
which versioned rule justified that guidance.

Using the first proposal as a diagnosis or comparing totals with different
technical scopes would create safety, trust and financial risks.

## Decision

VERAH will use a deterministic, versioned Quote Intelligence catalog before
introducing any external AI system.

The catalog is relational:

- `quote_rule_sets` identifies an immutable published vocabulary version;
- `service_taxonomy_entries` stores searchable services, symptoms, accessories
  and Labor Intelligence references;
- `service_quoteability_rules` stores typed routing and risk decisions;
- `quote_rule_requirements` stores normalized questions, evidence,
  measurements and documents;
- `service_taxonomy_related_services` records possible related work without
  making it mandatory;
- `quote_intelligence_assessments` preserves append-only decisions.

`public.classify_quote_intelligence` is the transactional classification
boundary. It validates a small PII-free input contract, resolves the active
rule, calculates missing requirements and confidence, persists one idempotent
assessment and records `quoteability.assessed` in the existing service request
timeline.

## Safety invariants

- Every assessment requires human review.
- Confidence describes rule matching and input completeness, not diagnostic
  certainty.
- The engine never confirms a diagnosis, authorizes a repair, approves a
  quote, selects a provider or states that a vehicle is safe to drive.
- Vehicle movement outputs are limited to not assessed, do not move, tow
  recommended, human review, or inspection location required.
- Unknown or incompatible accessory compatibility blocks readiness.
- Labor times are reference ranges, never promises.
- Related services are possibilities, never mandatory upsell.
- Hidden-cost risk never authorizes a charge.
- The existing quote form, totals and approval workflow remain unchanged.

## Authorization

All six tables use RLS. Concierge and Admin can read the internal catalog and
assessments. Customer, Provider and Anon cannot read them. A future customer
experience must use a separate sanitized projection, not the internal table.

The classification RPC is available only to authenticated sessions and
`service_role`; it additionally verifies Concierge/Admin authorization or a
signed service-role claim. It is `SECURITY DEFINER`, uses an empty
`search_path`, has a short statement timeout and has `PUBLIC` execution
revoked.

The server adapter imports `server-only` and is the only application path that
uses the service-role client.

## Consequences

### Positive

- Reproducible and explainable investor demonstration.
- Catalog changes do not reinterpret historical assessments.
- Missing evidence is explicit.
- Emergency and compatibility decisions fail closed.
- The model can later feed Quote Quality, comparison, second opinion and the
  Knowledge Platform.

### Costs and limitations

- The initial 59 rules require operational validation by automotive experts.
- Rule selection currently requires an explicit `service_code`; semantic
  matching from free text remains outside this PR.
- This PR does not evaluate a submitted quote or publish a customer comparison.
- It does not implement second opinion, movement authorization or UI.
- Only one rule set may be active at a time in the Alpha.

## Rejected alternatives

### Opaque JSON rule document

Rejected because important values would be difficult to query, constrain,
index and audit.

### External AI as the source of routing decisions

Rejected for the Alpha because it would make safety-critical behavior less
reproducible and would introduce credentials, cost and availability risks.

### Reusing `service_quotes` for technical assessment

Rejected because quote finance and technical guidance have different
lifecycles and audiences. Financial calculations remain the responsibility of
the existing quote tables and RPCs.

