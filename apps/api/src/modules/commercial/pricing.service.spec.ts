import { BadRequestException } from '@nestjs/common';
import { BillingCycle, BillingType, CustomerType } from '../../database/entities';
import { PricingService } from './pricing.service';

describe('PricingService', () => {
  const service = new PricingService();

  it('calcula pessoa física com dependentes', () => {
    const result = service.calculate({
      customerType: CustomerType.PERSON,
      cycle: BillingCycle.MONTHLY,
      billingType: BillingType.CREDIT_CARD,
      baseAmount: 100,
      dependentAmount: 25,
      dependentCount: 2,
      discounts: [],
    });

    expect(result.pricing.baseAmount).toBe(150);
    expect(result.pricing.finalAmount).toBe(150);
    expect(result.participants).toEqual({ dependentCount: 2 });
  });

  it('calcula pessoa jurídica com desconto percentual', () => {
    const result = service.calculate({
      customerType: CustomerType.COMPANY,
      cycle: BillingCycle.MONTHLY,
      billingType: BillingType.BOLETO,
      baseAmount: 40,
      unitPrice: 40,
      lives: 100,
      discounts: [{ type: 'PERCENTAGE', value: 10, reason: 'Aprovação comercial' }],
    });

    expect(result.pricing.baseAmount).toBe(4000);
    expect(result.pricing.discountAmount).toBe(400);
    expect(result.pricing.finalAmount).toBe(3600);
    expect(result.participants).toEqual({ contractedLives: 100 });
  });


  it('calcula o anual de pessoa física com desconto automático separado do comercial', () => {
    const result = service.calculate({
      customerType: CustomerType.PERSON,
      cycle: BillingCycle.YEARLY,
      billingType: BillingType.CREDIT_CARD,
      baseAmount: 80,
      dependentAmount: 30,
      dependentCount: 2,
      annualDiscountPercent: 10,
      discounts: [{ type: 'PERCENTAGE', value: 5, reason: 'Negociação' }],
    });

    expect(result.pricing.monthlySubtotal).toBe(140);
    expect(result.pricing.grossPeriodAmount).toBe(1680);
    expect(result.pricing.annualDiscountAmount).toBe(168);
    expect(result.pricing.negotiationBaseAmount).toBe(1512);
    expect(result.pricing.commercialDiscountAmount).toBe(75.6);
    expect(result.pricing.finalAmount).toBe(1436.4);
    expect(result.pricing.monthlyEquivalent).toBe(119.7);
  });

  it('rejeita cobrança anual para pessoa jurídica', () => {
    expect(() => service.calculate({
      customerType: CustomerType.COMPANY,
      cycle: BillingCycle.YEARLY,
      billingType: BillingType.CREDIT_CARD,
      baseAmount: 40,
      unitPrice: 40,
      lives: 10,
      discounts: [],
    })).toThrow(BadRequestException);
  });


  it('rejeita valores negativos e percentuais comerciais acima de 100%', () => {
    expect(() => service.calculate({
      customerType: CustomerType.PERSON,
      cycle: BillingCycle.MONTHLY,
      baseAmount: -1,
      dependentCount: 0,
      discounts: [],
    })).toThrow(BadRequestException);

    expect(() => service.calculate({
      customerType: CustomerType.PERSON,
      cycle: BillingCycle.MONTHLY,
      baseAmount: 100,
      dependentCount: 0,
      discounts: [{ type: 'PERCENTAGE', value: 101, reason: 'Inválido' }],
    })).toThrow(BadRequestException);
  });

  it('rejeita desconto superior ao valor-base', () => {
    expect(() => service.calculate({
      customerType: CustomerType.PERSON,
      cycle: BillingCycle.MONTHLY,
      baseAmount: 100,
      dependentAmount: 0,
      dependentCount: 0,
      discounts: [{ type: 'FIXED', value: 101, reason: 'Inválido' }],
    })).toThrow(BadRequestException);
  });
});
