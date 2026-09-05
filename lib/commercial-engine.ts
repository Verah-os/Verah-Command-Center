export type ServicePricingRule = {
  percent: number;
  minimumMargin: number;
  maximumMargin?: number;
};

export type LogisticsRule = {
  base: number;
  kmRate: number;
  minuteRate: number;
  minimumPrice: number;
  margin: number;
};

export type OperatorPayoutRule = {
  base: number;
  kmRate: number;
  minuteRate: number;
  bonus?: number;
};

export type CoreLogisticsInput = {
  missionType: "pickup_and_return";
  operationalKm: number;
  estimatedMinutes: number;
  additionalCosts?: number;
  customerRule: LogisticsRule;
  payoutRule: OperatorPayoutRule;
};

export type CommercialInput = {
  providerCost: number;
  serviceRule: ServicePricingRule;
  logistics: CoreLogisticsInput;
  paymentFee?: number;
  otherVariableCosts?: number;
};

export type CommercialResult = {
  providerAmount: number;
  serviceMargin: number;
  serviceCustomerPrice: number;
  logisticsCustomerPrice: number;
  operatorPayout: number;
  paymentFee: number;
  otherVariableCosts: number;
  customerTotal: number;
  verahGrossContribution: number;
};

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function nonNegative(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a non-negative finite number`);
  }
  return value;
}

function requireCoreLogistics(input: CommercialInput) {
  if (!input.logistics || input.logistics.missionType !== "pickup_and_return") {
    throw new Error("core VERAH quote requires pickup_and_return logistics");
  }
  return input.logistics;
}

export function calculateCommercialQuote(input: CommercialInput): CommercialResult {
  const providerCost = nonNegative(input.providerCost, "providerCost");
  const percentMargin = providerCost * nonNegative(input.serviceRule.percent, "serviceRule.percent");
  let serviceMargin = Math.max(percentMargin, nonNegative(input.serviceRule.minimumMargin, "serviceRule.minimumMargin"));

  if (input.serviceRule.maximumMargin !== undefined) {
    serviceMargin = Math.min(serviceMargin, nonNegative(input.serviceRule.maximumMargin, "serviceRule.maximumMargin"));
  }

  serviceMargin = money(serviceMargin);
  const serviceCustomerPrice = money(providerCost + serviceMargin);
  const logistics = requireCoreLogistics(input);
  const km = nonNegative(logistics.operationalKm, "logistics.operationalKm");
  const minutes = nonNegative(logistics.estimatedMinutes, "logistics.estimatedMinutes");
  const additionalCosts = nonNegative(logistics.additionalCosts ?? 0, "logistics.additionalCosts");
  const customerRule = logistics.customerRule;
  const payoutRule = logistics.payoutRule;

  const logisticsCostBasis =
    nonNegative(customerRule.base, "logistics.customerRule.base") +
    km * nonNegative(customerRule.kmRate, "logistics.customerRule.kmRate") +
    minutes * nonNegative(customerRule.minuteRate, "logistics.customerRule.minuteRate") +
    additionalCosts;

  const logisticsCustomerPrice = money(
    Math.max(
      logisticsCostBasis + nonNegative(customerRule.margin, "logistics.customerRule.margin"),
      nonNegative(customerRule.minimumPrice, "logistics.customerRule.minimumPrice"),
    ),
  );

  const operatorPayout = money(
    nonNegative(payoutRule.base, "logistics.payoutRule.base") +
      km * nonNegative(payoutRule.kmRate, "logistics.payoutRule.kmRate") +
      minutes * nonNegative(payoutRule.minuteRate, "logistics.payoutRule.minuteRate") +
      nonNegative(payoutRule.bonus ?? 0, "logistics.payoutRule.bonus"),
  );

  if (logisticsCustomerPrice <= 0 || operatorPayout <= 0) {
    throw new Error("core VERAH quote requires priced pickup and return logistics");
  }

  const paymentFee = money(nonNegative(input.paymentFee ?? 0, "paymentFee"));
  const otherVariableCosts = money(nonNegative(input.otherVariableCosts ?? 0, "otherVariableCosts"));
  const customerTotal = money(serviceCustomerPrice + logisticsCustomerPrice);
  const verahGrossContribution = money(
    customerTotal - providerCost - operatorPayout - paymentFee - otherVariableCosts,
  );

  return {
    providerAmount: money(providerCost),
    serviceMargin,
    serviceCustomerPrice,
    logisticsCustomerPrice,
    operatorPayout,
    paymentFee,
    otherVariableCosts,
    customerTotal,
    verahGrossContribution,
  };
}

export const COMMERCIAL_TEST_SCENARIOS = {
  small: {
    providerCost: 200,
    serviceRule: { percent: 0.15, minimumMargin: 40 },
    logistics: {
      missionType: "pickup_and_return",
      operationalKm: 12,
      estimatedMinutes: 40,
      customerRule: { base: 10, kmRate: 1, minuteRate: 0.2, minimumPrice: 69, margin: 20 },
      payoutRule: { base: 10, kmRate: 1, minuteRate: 0.4, bonus: 5 },
    },
  },
  medium: {
    providerCost: 600,
    serviceRule: { percent: 0.15, minimumMargin: 40 },
    logistics: {
      missionType: "pickup_and_return",
      operationalKm: 18,
      estimatedMinutes: 55,
      customerRule: { base: 10, kmRate: 1, minuteRate: 0.2, minimumPrice: 79, margin: 20 },
      payoutRule: { base: 10, kmRate: 1, minuteRate: 0.4, bonus: 5 },
    },
  },
  highTicket: {
    providerCost: 5000,
    serviceRule: { percent: 0.09, minimumMargin: 40, maximumMargin: 450 },
    logistics: {
      missionType: "pickup_and_return",
      operationalKm: 22,
      estimatedMinutes: 65,
      customerRule: { base: 10, kmRate: 1, minuteRate: 0.2, minimumPrice: 89, margin: 20 },
      payoutRule: { base: 10, kmRate: 1, minuteRate: 0.4, bonus: 5 },
    },
  },
} satisfies Record<string, CommercialInput>;
