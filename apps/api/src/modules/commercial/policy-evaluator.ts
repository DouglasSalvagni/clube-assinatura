import { BillingCycle, BillingType, CustomerType, NegotiationPolicy, UnitRole } from '../../database/entities';

export type PolicyEvaluation = {
  allowed: boolean;
  violations: string[];
  appliedPolicyIds: string[];
  maxDiscountPercent: number;
  maxDiscountAmount: number | null;
  minUnitPrice: number | null;
  allowedBillingTypes: BillingType[];
  allowedBillingCycles: BillingCycle[];
  maxLives: number | null;
};

export function evaluateNegotiationPolicies(
  policies: NegotiationPolicy[],
  userId: string,
  role: UnitRole | null,
  teamId: string | null,
  negotiation: any,
): PolicyEvaluation {
  const applicable = policies.filter((policy) =>
    policy.active
    && !policy.archivedAt
    && (!policy.customerType || policy.customerType === negotiation?.customerType)
    && (!policy.targetUserId || policy.targetUserId === userId)
    && (!policy.targetTeamId || policy.targetTeamId === teamId)
    && (!policy.targetRole || policy.targetRole === role));

  const maxPercent = applicable.length
    ? Math.min(...applicable.map((policy) => Number(policy.maxDiscountPercent)))
    : 0;
  const amountLimits = applicable
    .map((policy) => policy.maxDiscountAmount == null ? null : Number(policy.maxDiscountAmount))
    .filter((value): value is number => value !== null);
  const maxAmount = amountLimits.length ? Math.min(...amountLimits) : null;
  const discountPercent = (negotiation?.discounts || [])
    .filter((discount: any) => discount.type === 'PERCENTAGE')
    .reduce((total: number, discount: any) => total + Number(discount.value), 0);
  const discountAmount = Number(
    negotiation?.pricing?.commercialDiscountAmount
    ?? negotiation?.pricing?.discountAmount
    ?? 0,
  );
  const violations: string[] = [];

  if (discountPercent > maxPercent) {
    violations.push(`Desconto comercial de ${discountPercent}% supera o limite de ${maxPercent}%.`);
  }
  if (maxAmount != null && discountAmount > maxAmount) {
    violations.push(`Desconto comercial de R$ ${discountAmount.toFixed(2)} supera o limite de R$ ${maxAmount.toFixed(2)}.`);
  }

  const companyNegotiation = negotiation?.customerType === CustomerType.COMPANY;
  const minimumPrices = companyNegotiation
    ? applicable
        .map((policy) => policy.minUnitPrice == null ? null : Number(policy.minUnitPrice))
        .filter((value): value is number => value !== null)
    : [];
  const minimumUnitPrice = minimumPrices.length ? Math.max(...minimumPrices) : null;
  const negotiatedUnitPrice = Number(negotiation?.pricing?.unitPrice || 0);
  if (minimumUnitPrice != null && negotiatedUnitPrice < minimumUnitPrice) {
    violations.push(
      `Preço-base negociado por vida de R$ ${negotiatedUnitPrice.toFixed(2)} abaixo do mínimo permitido de R$ ${minimumUnitPrice.toFixed(2)}.`,
    );
  }

  const paymentSets = applicable
    .map((policy) => policy.allowedBillingTypes || [])
    .filter((types) => types.length > 0);
  const allowedBillingTypes = paymentSets.length
    ? paymentSets.reduce(
        (intersection, types) => intersection.filter((type) => types.includes(type)),
        [...paymentSets[0]],
      )
    : Object.values(BillingType).filter((type) => type !== BillingType.UNDEFINED);
  const requestedBillingTypes = negotiation?.allowedBillingTypes?.length
    ? negotiation.allowedBillingTypes
    : negotiation?.billingType ? [negotiation.billingType] : [];
  const invalidBillingTypes = requestedBillingTypes.filter(
    (type: BillingType) => !allowedBillingTypes.includes(type),
  );
  if (invalidBillingTypes.length) {
    violations.push(`Forma de pagamento não permitida: ${invalidBillingTypes.join(', ')}.`);
  }

  const defaultCycles = negotiation?.customerType === CustomerType.COMPANY
    ? [BillingCycle.MONTHLY]
    : [BillingCycle.MONTHLY, BillingCycle.YEARLY];
  const cycleSets = applicable
    .map((policy) => Array.isArray(policy.rules?.allowedBillingCycles)
      ? policy.rules.allowedBillingCycles as BillingCycle[]
      : [])
    .filter((cycles) => cycles.length > 0);
  const allowedBillingCycles = cycleSets.reduce(
    (intersection, cycles) => intersection.filter((cycle) => cycles.includes(cycle)),
    [...defaultCycles],
  );
  if (negotiation?.cycle && !allowedBillingCycles.includes(negotiation.cycle)) {
    violations.push(`Periodicidade não permitida: ${negotiation.cycle}.`);
  }

  const maxLivesLimits = companyNegotiation
    ? applicable
        .map((policy) => Number(policy.rules?.maxLives || 0))
        .filter((value) => value > 0)
    : [];
  const maxLives = maxLivesLimits.length ? Math.min(...maxLivesLimits) : null;
  const contractedLives = Number(negotiation?.participants?.contractedLives || 0);
  if (maxLives != null && contractedLives > maxLives) {
    violations.push(`Quantidade de vidas acima do limite de ${maxLives}.`);
  }

  return {
    allowed: violations.length === 0,
    violations,
    appliedPolicyIds: applicable.map((policy) => policy.id),
    maxDiscountPercent: maxPercent,
    maxDiscountAmount: maxAmount,
    minUnitPrice: minimumUnitPrice,
    allowedBillingTypes,
    allowedBillingCycles,
    maxLives,
  };
}
