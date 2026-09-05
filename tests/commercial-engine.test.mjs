import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateCommercialQuote,
  COMMERCIAL_TEST_SCENARIOS,
} from "../lib/commercial-engine.ts";

test("small service includes mandatory pickup and return", () => {
  const result = calculateCommercialQuote(COMMERCIAL_TEST_SCENARIOS.small);
  assert.equal(result.providerAmount, 200);
  assert.equal(result.serviceMargin, 40);
  assert.equal(result.serviceCustomerPrice, 240);
  assert.equal(result.logisticsCustomerPrice, 69);
  assert.equal(result.operatorPayout, 43);
  assert.equal(result.customerTotal, 309);
  assert.equal(result.verahGrossContribution, 66);
});

test("medium service reconciles mandatory pickup and return", () => {
  const result = calculateCommercialQuote(COMMERCIAL_TEST_SCENARIOS.medium);
  assert.equal(result.providerAmount, 600);
  assert.equal(result.serviceMargin, 90);
  assert.equal(result.serviceCustomerPrice, 690);
  assert.equal(result.logisticsCustomerPrice, 79);
  assert.equal(result.operatorPayout, 55);
  assert.equal(result.customerTotal, 769);
  assert.equal(result.verahGrossContribution, 114);
});

test("high-ticket scenario keeps capped service margin and mandatory logistics", () => {
  const result = calculateCommercialQuote(COMMERCIAL_TEST_SCENARIOS.highTicket);
  assert.equal(result.providerAmount, 5000);
  assert.equal(result.serviceMargin, 450);
  assert.equal(result.serviceCustomerPrice, 5450);
  assert.equal(result.logisticsCustomerPrice, 89);
  assert.equal(result.operatorPayout, 63);
  assert.equal(result.customerTotal, 5539);
  assert.equal(result.verahGrossContribution, 476);
});

test("payment and variable costs reduce VERAH contribution without changing customer quote", () => {
  const result = calculateCommercialQuote({
    ...COMMERCIAL_TEST_SCENARIOS.small,
    paymentFee: 7.2,
    otherVariableCosts: 5,
  });
  assert.equal(result.customerTotal, 309);
  assert.equal(result.verahGrossContribution, 53.8);
});

test("core quote fails closed without pickup and return logistics", () => {
  const invalid = {
    providerCost: 200,
    serviceRule: { percent: 0.15, minimumMargin: 40 },
  };
  assert.throws(
    () => calculateCommercialQuote(invalid),
    /requires pickup_and_return logistics/,
  );
});

test("core quote fails closed when logistics has no payable custody mission", () => {
  const invalid = {
    ...COMMERCIAL_TEST_SCENARIOS.small,
    logistics: {
      missionType: "pickup_and_return",
      operationalKm: 0,
      estimatedMinutes: 0,
      customerRule: { base: 0, kmRate: 0, minuteRate: 0, minimumPrice: 0, margin: 0 },
      payoutRule: { base: 0, kmRate: 0, minuteRate: 0, bonus: 0 },
    },
  };
  assert.throws(
    () => calculateCommercialQuote(invalid),
    /requires priced pickup and return logistics/,
  );
});

test("negative inputs fail closed", () => {
  assert.throws(
    () => calculateCommercialQuote({ ...COMMERCIAL_TEST_SCENARIOS.small, providerCost: -1 }),
    /providerCost/,
  );
});
