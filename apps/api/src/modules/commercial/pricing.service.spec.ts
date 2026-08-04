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
