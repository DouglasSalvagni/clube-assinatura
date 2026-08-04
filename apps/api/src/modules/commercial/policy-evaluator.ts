import { BillingType, NegotiationPolicy, UnitRole } from '../../database/entities';

export type PolicyEvaluation = {
  allowed: boolean;
  violations: string[];
  appliedPolicyIds: string[];
  maxDiscountPercent: number;
  maxDiscountAmount: number | null;
  minUnitPrice: number | null;
  allowedBillingTypes: BillingType[];
  maxLives: number | null;
};

export function evaluateNegotiationPolicies(
  policies: NegotiationPolicy[],
  userId: string,
  role: UnitRole | null,
  negotiation: any,
): PolicyEvaluation {
  const applicable = policies.filter((policy) =>
    policy.active
    && (!policy.targetUserId || policy.targetUserId === userId)
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
  const discountAmount = Number(negotiation?.pricing?.discountAmount || 0);
  const violations: string[] = [];

  if (discountPercent > maxPercent) {
    violations.push(`Desconto de ${discountPercent}% supera o limite de ${maxPercent}%.`);
  }
  if (maxAmount != null && discountAmount > maxAmount) {
    violations.push(`Desconto nominal de R$ ${discountAmount.toFixed(2)} supera o limite de R$ ${maxAmount.toFixed(2)}.`);
  }

  const minimumPrices = applicable
    .map((policy) => policy.minUnitPrice == null ? null : Number(policy.minUnitPrice))
    .filter((value): value is number => value !== null);
  const minimumUnitPrice = minimumPrices.length ? Math.max(...minimumPrices) : null;
  if (minimumUnitPrice != null && Number(negotiation?.pricing?.unitPrice || 0) < minimumUnitPrice) {
    violations.push(`Preço unitário abaixo do mínimo de R$ ${minimumUnitPrice.toFixed(2)}.`);
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

  const maxLivesLimits = applicable
    .map((policy) => Number(policy.rules?.maxLives || 0))
    .filter((value) => value > 0);
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
    maxLives,
  };
}
