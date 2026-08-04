import { BillingType, CustomerType, NegotiationPolicy, UnitRole } from '../../database/entities';
import { evaluateNegotiationPolicies } from './policy-evaluator';

function policy(overrides: Partial<NegotiationPolicy> = {}): NegotiationPolicy {
  return {
    id: 'policy-1',
    active: true,
    archivedAt: null,
    customerType: null,
    targetRole: null,
    targetUserId: null,
    maxDiscountPercent: '10',
    maxDiscountAmount: '500',
    minUnitPrice: '30',
    allowedBillingTypes: [BillingType.CREDIT_CARD, BillingType.BOLETO],
    rules: { maxLives: 200 },
    ...overrides,
  } as NegotiationPolicy;
}

describe('evaluateNegotiationPolicies', () => {
  it('combina políticas usando os limites mais restritivos', () => {
    const result = evaluateNegotiationPolicies([
      policy(),
      policy({
        id: 'policy-2',
        maxDiscountPercent: '5',
        minUnitPrice: '35',
        allowedBillingTypes: [BillingType.CREDIT_CARD],
        rules: { maxLives: 100 },
      }),
    ], 'user-1', UnitRole.SALES, {
      customerType: CustomerType.COMPANY,
      discounts: [{ type: 'PERCENTAGE', value: 6 }],
      pricing: { discountAmount: 200, unitPrice: 34 },
      participants: { contractedLives: 120 },
      allowedBillingTypes: [BillingType.BOLETO],
    });

    expect(result.allowed).toBe(false);
    expect(result.maxDiscountPercent).toBe(5);
    expect(result.minUnitPrice).toBe(35);
    expect(result.maxLives).toBe(100);
    expect(result.allowedBillingTypes).toEqual([BillingType.CREDIT_CARD]);
    expect(result.violations).toHaveLength(4);
  });

  it('considera somente políticas aplicáveis ao usuário e perfil', () => {
    const result = evaluateNegotiationPolicies([
      policy({ id: 'global' }),
      policy({ id: 'other-user', targetUserId: 'user-2', maxDiscountPercent: '1' }),
      policy({ id: 'manager', targetRole: UnitRole.MANAGER, maxDiscountPercent: '2' }),
    ], 'user-1', UnitRole.SALES, {
      customerType: CustomerType.COMPANY,
      discounts: [{ type: 'PERCENTAGE', value: 8 }],
      pricing: { discountAmount: 80, unitPrice: 40 },
      participants: { contractedLives: 10 },
      billingType: BillingType.CREDIT_CARD,
    });

    expect(result.allowed).toBe(true);
    expect(result.appliedPolicyIds).toEqual(['global']);
  });

  it('aplica o escopo de pessoa física ou jurídica e ignora políticas arquivadas', () => {
    const result = evaluateNegotiationPolicies([
      policy({ id: 'person', customerType: CustomerType.PERSON, maxDiscountPercent: '0' }),
      policy({ id: 'company', customerType: CustomerType.COMPANY, maxDiscountPercent: '10' }),
      policy({ id: 'archived', customerType: CustomerType.COMPANY, archivedAt: new Date(), maxDiscountPercent: '1' }),
    ], 'user-1', UnitRole.SALES, {
      customerType: CustomerType.COMPANY,
      discounts: [{ type: 'PERCENTAGE', value: 8 }],
      pricing: { discountAmount: 80, unitPrice: 40 },
      participants: { contractedLives: 10 },
      billingType: BillingType.CREDIT_CARD,
    });

    expect(result.allowed).toBe(true);
    expect(result.maxDiscountPercent).toBe(10);
    expect(result.appliedPolicyIds).toEqual(['company']);
  });


  it('não aplica preço por vida nem limite de vidas a negociações de pessoa física', () => {
    const result = evaluateNegotiationPolicies([
      policy({ id: 'both', customerType: null, minUnitPrice: '50', rules: { maxLives: 1 } }),
    ], 'user-1', UnitRole.SALES, {
      customerType: CustomerType.PERSON,
      discounts: [],
      pricing: { discountAmount: 0, holderAmount: 99.9, unitPrice: null },
      participants: { dependentCount: 3 },
      billingType: BillingType.CREDIT_CARD,
    });

    expect(result.allowed).toBe(true);
    expect(result.minUnitPrice).toBeNull();
    expect(result.maxLives).toBeNull();
  });

});
