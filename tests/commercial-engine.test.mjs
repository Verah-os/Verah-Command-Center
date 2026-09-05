import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateCommercialQuote,
  COMMERCIAL_TEST_SCENARIOS,
} from "../lib/commercial-engine.ts";

test("small service applies minimum margin", () => {
  const result = calculateCommercialQuote(COMMERCIAL_TEST_SCENARIOS.small);
  assert.equal(result.providerAmount, 200);
  assert.equal(result.serviceMargin, 40);
  assert.equal(result.customerTotal, 240);
  assert.equal(result.verahGrossContribution, 40);
});

test("medium service plus logistics reconciles customer total and payouts", () => {
  const result = calculateCommercialQuote(COMMERCIAL_TEST_SCENARIOS.mediumWithLogistics);
  assert.equal(result.providerAmount, 600);
  assert.equal(result.serviceMargin, 90);
  assert.equal(result.serviceCustomerPrice, 690);
  assert.equal(result.logisticsCustomerPrice, 79);
  assert.equal(result.operatorPayout, 55);
  assert.equal(result.customerTotal, 769);
  assert.equal(result.verahGrossContribution, 114);
});

test("high-ticket scenario uses a capped/decreasing commercial rule", () => {
  const result = calculateCommercialQuote(COMMERCIAL_TEST_SCENARIOS.highTicket);
  assert.equal(result.providerAmount, 5000);
  assert.equal(result.serviceMargin, 450);
  assert.equal(result.customerTotal, 5450);
  assert.equal(result.verahGrossContribution, 450);
});

test("payment and variable costs reduce VERAH contribution without changing customer quote", () => {
  const result = calculateCommercialQuote({
    ...COMMERCIAL_TEST_SCENARIOS.small,
    paymentFee: 7.2,
    otherVariableCosts: 5,
  });
  assert.equal(result.customerTotal, 240);
  assert.equal(result.verahGrossContribution, 27.8);
});

test("negative inputs fail closed", () => {
  assert.throws(
    () => calculateCommercialQuote({ providerCost: -1, serviceRule: { percent: 0.15, minimumMargin: 40 } }),
    /providerCost/,
  );
});
