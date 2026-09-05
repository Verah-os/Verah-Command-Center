# VERAH Commercial Engine

Status: product/engineering specification for Issue #198.

## Goal

Give the customer one VERAH quote and one payment experience while keeping the internal economics explicit, auditable and independent from any single payment provider.

The engine must support an investor/demo scenario before real-money rails are selected.

## Product principles

1. Customer sees one final VERAH price.
2. Prestador sees the amount relevant to the provider role, not VERAH margin.
3. Concierge/operator sees the payout for the accepted mission, not provider economics or VERAH margin.
4. Admin sees the complete composition and may override commercial rules only with an audit trail.
5. Concierge cannot alter prices, margins, discounts or commercial tables.
6. Additional work after customer approval requires a supplemental quote and a new explicit approval.
7. Commercial rules are backend/Admin configurable. Percentages and values in demos are hypotheses, never hardcoded product truth.
8. The internal ledger is the source of economic composition; Mercado Pago, Stripe or another PSP is an adapter for collection/split/payout.

## Two pricing motors

### Motor 1 — Automotive service

Inputs:
- provider/base cost;
- service category;
- optional provider/category negotiated condition;
- percentage rule;
- minimum margin;
- optional cap/maximum rule;
- Admin override when justified.

Initial formula concept:

`service_margin = max(provider_cost * margin_percent, minimum_margin)`

`service_customer_price = provider_cost + service_margin`

If a cap or price-band rule exists it is applied before the quote is presented to the customer.

The final production rule may use decreasing percentage bands. A flat percentage must not be assumed globally.

### Motor 2 — Leva & Traz / operational mission

The customer buys the complete VERAH logistics experience, not a raw kilometre transport service.

Internal pricing inputs may include:
- mission base;
- total operational kilometres;
- expected mission time;
- waiting time;
- toll/parking when applicable;
- mission type (pickup, return, complete, waiting, long-distance, special);
- minimum commercial price;
- operational margin.

Conceptual formula:

`logistics_cost_basis = base + (operational_km * km_rate) + (estimated_minutes * minute_rate) + explicit_additional_costs`

`logistics_customer_price = max(logistics_cost_basis + logistics_margin, minimum_logistics_price)`

No dynamic/surge pricing is required for MVP.

## Concierge/operator payout

Customer logistics price and Concierge/operator payout are separate values.

A mission payout may use:

`operator_payout = payout_base + (operational_km * payout_km_rate) + (estimated_minutes * payout_minute_rate) + bonuses + reimbursable_costs`

The operator should know the expected payout before accepting a mission.

The architecture must allow the Concierge responsible for the customer journey and the physical pickup/return operator to be different people. In the MVP the same person may perform both roles.

## Quote composition

A commercial quote must preserve at least:
- provider amount/cost;
- automotive service margin;
- logistics customer price when applicable;
- Concierge/operator payout when applicable;
- expected payment fee;
- explicit variable operational costs;
- VERAH gross revenue/margin;
- customer final total;
- quote version/status;
- creator and timestamps;
- approvals and supplemental quote references;
- override record when applicable.

Recommended consistency equation:

`customer_total = provider_amount + operator_payout + payment_and_variable_costs + VERAH_contribution_before_fixed_costs`

For a more detailed UI the engine may also show service and logistics revenue separately, but the ledger must reconcile to the customer total.

## Visibility matrix

### Customer
Sees:
- service description;
- what is included;
- final VERAH price;
- logistics inclusion when relevant;
- approval state;
- supplemental quotes;
- payment status;
- guarantee/after-sales information applicable to the service.

Does not see:
- provider negotiated cost;
- VERAH margin;
- operator payout;
- internal commercial table.

### Provider
Sees:
- scope;
- own quoted/base amount and/or amount to receive according to contract;
- approval/execution status;
- payout status.

Does not see:
- VERAH margin;
- operator payout;
- another provider's terms.

### Concierge / Operator
Sees:
- operational mission information;
- expected payout for missions the user may accept/execute;
- service/customer information necessary for the role.

Cannot alter financial components.

### Admin
Sees full composition and commercial rule used.
Can simulate and override with mandatory reason and audit.

## Demonstration scenarios

The first demonstrable implementation must ship with at least three explicit test scenarios. Values are examples only.

### Small service
Provider cost: R$ 200.00
Commercial minimum/margin results in customer service price: R$ 240.00.
No logistics.

### Medium service + pickup/return
Provider cost: R$ 600.00
Service customer price: R$ 690.00.
Operator payout: R$ 55.00.
Logistics customer price: R$ 79.00.
Customer final price: R$ 769.00.
The Admin simulator must show how the logistics margin and total VERAH contribution are derived.

### High-ticket service
Provider cost: R$ 5,000.00.
The engine must demonstrate a decreasing band/cap rule instead of blindly applying the same percentage used for low-value services.

## Payment integration target

Customer experience: one checkout/charge.

Target architecture: marketplace/split-capable PSP where legally and technically appropriate.

The VERAH ledger must remain provider-agnostic so a sandbox implementation can use Mercado Pago, Stripe Connect or another provider without changing domain rules.

Possible payment states:
- pending;
- authorized/approved;
- failed;
- refundable;
- partially_refunded;
- refunded;
- payout_pending;
- payout_released;
- payout_failed;
- disputed.

Never infer settlement from the checkout redirect. Webhook/server confirmation is authoritative.

## Financial safety / governance

- Idempotency required for payment and webhook processing.
- No duplicate payouts for repeated webhook delivery.
- Quote approval is versioned.
- A modified approved quote cannot silently replace the approved version.
- Supplemental work creates a new customer approval event.
- Admin override records: actor, timestamp, old value, new value and reason.
- Payout release can be gated by service completion and dispute/safety rules.

## Network positioning

VERAH network participation is curation, not an auction.

Future provider monetization may charge for platform capabilities, access to qualified demand or partnership services, but payment must not buy an inappropriate recommendation or override customer-first matching/homologation criteria.

## Out of scope for this first implementation

- definitive Brazilian fiscal/accounting classification;
- irreversible choice of payment gateway;
- Care/Premium subscription;
- B2B provider subscription/access charge;
- dynamic surge pricing;
- customer-selected external workshop + VERAH pickup/dropoff;
- real-money payouts without legal/fiscal validation.

## Acceptance criteria

1. Commercial parameters can be changed without rebuilding the customer app.
2. Admin can simulate all three reference scenarios.
3. Customer representation is a single final VERAH price.
4. Concierge cannot alter commercial values.
5. Provider and Concierge/operator visibility follows the role matrix.
6. Internal composition reconciles customer charge, provider amount, operator payout, fees/costs and VERAH contribution.
7. Approved quotes are immutable; changes require a supplemental version/approval.
8. Gateway integration is an adapter behind the VERAH ledger.
9. Demo values are visibly labeled as hypotheses/test parameters in Admin/docs.
10. Implementation remains compatible with the operational practices in Issue #199.