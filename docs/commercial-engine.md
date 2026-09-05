# VERAH Commercial Engine

Status: product/engineering specification for Issues #198, #199 and #201.

## Goal

Give the customer one VERAH quote and one payment experience while keeping the internal economics explicit, auditable and independent from any single payment provider.

The core product is the complete VERAH journey: automotive service + pickup + custody protocol + coordination + return. Leva & Traz is not a customer-facing add-on in the standard journey.

## Product principles

1. Customer sees one final VERAH price.
2. Every core VERAH quote requires pickup and return logistics.
3. Service and logistics stay separated internally only for unit economics, payout, fees and governance.
4. Provider sees the amount relevant to the provider role, not VERAH margin.
5. Concierge/operator sees only the payout and operational data necessary for the accepted mission.
6. Admin sees the complete composition and may override commercial rules only with an audit trail.
7. Concierge cannot alter prices, margins, discounts or commercial tables.
8. Additional work after customer approval requires a supplemental quote and new explicit approval.
9. Commercial rules are backend/Admin configurable. Demo values are hypotheses, never hardcoded product truth.
10. The internal ledger is the source of economic composition; payment gateways are adapters.

## Customer journey and network identity

The customer chooses VERAH. VERAH selects and coordinates the homologated provider needed for the case.

Default customer-facing language should use concepts such as `Rede VERAH` and `Prestador Homologado VERAH`. The standard journey does not need to expose workshop address, direct contact or operational provider identity when that information is not needed for the customer to receive the service.

This abstraction must never hide information that is legally, fiscally or contractually required, or necessary for invoice, warranty, safety, consent or exercise of customer rights. The product must not claim that VERAH mechanically performed work executed by a third party.

A future strategic network partnership may be presented through configurable co-branding (`network_brand` or equivalent). No national brand, manufacturer or workshop chain may be hardcoded into the domain.

Retention must come from the value of the VERAH journey — curation, pickup/return, protected approvals, coordination, history and after-sales — rather than from concealment alone.

## Motor 1 — Automotive service

Inputs may include provider/base cost, category, negotiated conditions, percentage rule, minimum margin, optional maximum/cap and audited Admin override.

Conceptual formula:

`service_margin = max(provider_cost * margin_percent, minimum_margin)`

`service_customer_price = provider_cost + service_margin`

A maximum margin or decreasing price-band rule may be applied before the quote is presented. A flat global percentage must not be assumed.

## Motor 2 — Mandatory Leva & Traz

For a core quote, the logistics mission type is `pickup_and_return`. The engine fails closed when that mission is absent or has no payable/priced operational component.

Internal inputs may include mission base, total operational kilometres for pickup + return, expected total mission time, waiting, toll/parking, explicit additional costs, minimum commercial price and logistics margin.

Conceptual formula:

`logistics_cost_basis = base + (operational_km * km_rate) + (estimated_minutes * minute_rate) + explicit_additional_costs`

`logistics_customer_price = max(logistics_cost_basis + logistics_margin, minimum_logistics_price)`

No dynamic/surge pricing is required for MVP.

## Operator payout

Customer logistics price and operator payout are separate values.

`operator_payout = payout_base + (operational_km * payout_km_rate) + (estimated_minutes * payout_minute_rate) + bonus`

The operator should know expected payout before accepting a mission. Concierge and physical pickup/return operator may be different people; the MVP may allow the same person to perform both functions without coupling the roles in the domain.

## Quote composition

A commercial quote must preserve at least provider amount, automotive service margin, logistics customer price, operator payout, expected payment fee, variable operational costs, VERAH gross contribution, customer final total, quote version/status, approvals, supplemental quote references and audited overrides.

Consistency equation:

`customer_total = provider_amount + operator_payout + payment_and_variable_costs + VERAH_contribution_before_fixed_costs`

Customer presentation remains one final VERAH price even though Admin can inspect internal components.

## Visibility matrix

### Customer

Sees service scope, what the VERAH journey includes, final VERAH price, approval/payment state, status/timeline and applicable warranty/after-sales information. Does not see provider negotiated cost, VERAH margin, operator payout or internal commercial rules.

### Provider

Sees scope, own quoted/base amount or amount to receive, approval/execution status and payout status. Does not see VERAH margin, operator payout or another provider's commercial terms.

### Concierge / Operator

Sees the operational information required for the role and expected payout for missions the user may accept/execute. Cannot alter commercial components.

### Admin

Sees full composition, rule used and provider allocation. Can simulate and perform justified overrides with mandatory audit.

## Demonstration scenarios

All reference scenarios are core VERAH journeys and therefore include pickup + return.

### Small service

Provider cost: R$ 200.00. Service component: R$ 240.00. Reference Leva & Traz component: R$ 69.00. Operator payout: R$ 43.00. Customer final reference price: R$ 309.00. Values are hypotheses for testing.

### Medium service

Provider cost: R$ 600.00. Service component: R$ 690.00. Operator payout: R$ 55.00. Leva & Traz component: R$ 79.00. Customer final reference price: R$ 769.00.

### High-ticket service

Provider cost: R$ 5,000.00. Service margin demonstrates a decreasing/capped commercial rule. Reference service component: R$ 5,450.00. Leva & Traz component: R$ 89.00. Operator payout: R$ 63.00. Customer final reference price: R$ 5,539.00.

## Payment integration target

Customer experience: one checkout/charge. Target architecture: marketplace/split-capable PSP where legally and technically appropriate.

The VERAH ledger must remain provider-agnostic so Mercado Pago, Stripe Connect or another provider can be integrated without changing domain rules. Never infer settlement from a checkout redirect; webhook/server confirmation is authoritative.

## Financial safety / governance

- Idempotency is required for payment and webhook processing.
- No duplicate payout for repeated webhook delivery.
- Quote approval is versioned.
- An approved quote cannot be silently replaced.
- Supplemental work creates a new customer approval event.
- Admin override records actor, timestamp, previous value, new value and reason.
- Payout release may be gated by service completion and dispute/safety rules.
- Concierge operates; Admin governs money.

## Network positioning

VERAH network participation is curation, not an auction. Future provider monetization may charge for platform capabilities, qualified demand access or partnership services, but payment must not buy an inappropriate recommendation or override customer-first homologation/matching criteria.

## Out of scope for this implementation

- definitive Brazilian fiscal/accounting classification;
- irreversible choice of payment gateway;
- real-money payout;
- Care/Premium subscription;
- B2B provider subscription/access charge;
- dynamic pricing by demand;
- customer-selected external workshop + VERAH pickup/dropoff.

## Acceptance criteria

1. Every core scenario requires pickup + return logistics.
2. Admin simulator has no standard switch to remove Leva & Traz.
3. Customer representation is one final VERAH price.
4. Internal composition reconciles provider amount, operator payout, fees/costs and VERAH contribution.
5. Concierge cannot alter commercial values.
6. Provider identity remains available internally while customer-facing identity defaults to Rede/Prestador Homologado VERAH, subject to disclosure rules.
7. Strategic network co-branding is configurable and contains no hardcoded partner brand.
8. Small, medium and high-ticket tests all include logistics and reject malformed core quotes without it.
9. Demo values are visibly labeled as hypotheses/test parameters.
10. Gateway integration stays behind the VERAH ledger until fiscal/provider decisions are validated.
