import { BillingCycle, BillingType, CustomerType, NegotiationPolicy, UnitRole } from '../../database/entities';
import { evaluateNegotiationPolicies } from './policy-evaluator';

function policy(overrides: Partial<NegotiationPolicy> = {}): NegotiationPolicy {
  return {
    id: 'policy-1',
    active: true,
    archivedAt: null,
    customerType: null,
    targetRole: null,
    targetUserId: null,
    targetTeamId: null,
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
    ], 'user-1', UnitRole.SALES, null, {
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
    ], 'user-1', UnitRole.SALES, null, {
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
    ], 'user-1', UnitRole.SALES, null, {
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
    ], 'user-1', UnitRole.SALES, null, {
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

  it('aplica políticas do time da oportunidade e mantém o limite mais restritivo', () => {
    const result = evaluateNegotiationPolicies([
      policy({ id: 'global', maxDiscountPercent: '10' }),
      policy({ id: 'team-a', targetTeamId: 'team-a', maxDiscountPercent: '4' }),
      policy({ id: 'team-b', targetTeamId: 'team-b', maxDiscountPercent: '1' }),
    ], 'user-1', UnitRole.SALES, 'team-a', {
      customerType: CustomerType.PERSON,
      cycle: BillingCycle.MONTHLY,
      discounts: [{ type: 'PERCENTAGE', value: 5 }],
      pricing: { commercialDiscountAmount: 5, holderAmount: 100 },
      participants: { dependentCount: 0 },
      billingType: BillingType.CREDIT_CARD,
    });

    expect(result.allowed).toBe(false);
    expect(result.maxDiscountPercent).toBe(4);
    expect(result.appliedPolicyIds).toEqual(['global', 'team-a']);
  });


  it('avalia o preço mínimo sobre o preço-base negociado, sem reaplicar o desconto', () => {
    const result = evaluateNegotiationPolicies([
      policy({
        minUnitPrice: '35',
        maxDiscountPercent: '20',
        maxDiscountAmount: null,
      }),
    ], 'user-1', UnitRole.SALES, null, {
      customerType: CustomerType.COMPANY,
      cycle: BillingCycle.MONTHLY,
      discounts: [{ type: 'PERCENTAGE', value: 15 }],
      pricing: {
        unitPrice: 40,
        commercialDiscountAmount: 60,
        finalAmount: 340,
      },
      participants: { contractedLives: 10 },
      billingType: BillingType.CREDIT_CARD,
    });

    expect(result.allowed).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('exige aprovação quando o preço-base negociado fica abaixo do mínimo', () => {
    const result = evaluateNegotiationPolicies([
      policy({
        minUnitPrice: '35',
        maxDiscountPercent: '20',
        maxDiscountAmount: null,
      }),
    ], 'user-1', UnitRole.SALES, null, {
      customerType: CustomerType.COMPANY,
      cycle: BillingCycle.MONTHLY,
      discounts: [{ type: 'PERCENTAGE', value: 10 }],
      pricing: {
        unitPrice: 34,
        commercialDiscountAmount: 34,
        finalAmount: 306,
      },
      participants: { contractedLives: 10 },
      billingType: BillingType.CREDIT_CARD,
    });

    expect(result.allowed).toBe(false);
    expect(result.violations).toEqual([
      'Preço-base negociado por vida de R$ 34.00 abaixo do mínimo permitido de R$ 35.00.',
    ]);
  });

  it('aplica as periodicidades permitidas pela política', () => {
    const result = evaluateNegotiationPolicies([
      policy({
        customerType: CustomerType.PERSON,
        minUnitPrice: null,
        rules: { allowedBillingCycles: [BillingCycle.MONTHLY] },
      }),
    ], 'user-1', UnitRole.SALES, null, {
      customerType: CustomerType.PERSON,
      cycle: BillingCycle.YEARLY,
      discounts: [],
      pricing: { commercialDiscountAmount: 0, finalAmount: 1080 },
      participants: { dependentCount: 0 },
      billingType: BillingType.CREDIT_CARD,
    });

    expect(result.allowed).toBe(false);
    expect(result.allowedBillingCycles).toEqual([BillingCycle.MONTHLY]);
    expect(result.violations).toContain('Periodicidade não permitida: YEARLY.');
  });

  it('não considera o desconto anual automático como desconto comercial', () => {
    const result = evaluateNegotiationPolicies([
      policy({ maxDiscountPercent: '0' }),
    ], 'user-1', UnitRole.SALES, null, {
      customerType: CustomerType.PERSON,
      cycle: BillingCycle.YEARLY,
      discounts: [],
      pricing: {
        annualDiscountPercent: 10,
        annualDiscountAmount: 120,
        commercialDiscountAmount: 0,
        finalAmount: 1080,
      },
      billingType: BillingType.CREDIT_CARD,
    });

    expect(result.allowed).toBe(true);
    expect(result.violations).toEqual([]);
  });

});
