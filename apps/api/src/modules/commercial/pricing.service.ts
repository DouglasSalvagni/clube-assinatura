import { BadRequestException, Injectable } from '@nestjs/common';
import { CustomerType } from '../../database/entities';
import { SimulateNegotiationDto } from './commercial.dto';

@Injectable()
export class PricingService {
  calculate(input: SimulateNegotiationDto) {
    const quantity = input.customerType === CustomerType.COMPANY
      ? input.lives ?? 1
      : input.dependentCount ?? 0;

    const base = input.customerType === CustomerType.COMPANY
      ? (input.unitPrice ?? input.baseAmount) * quantity
      : input.baseAmount + (input.dependentAmount ?? 0) * quantity;

    let discountAmount = 0;
    for (const discount of input.discounts ?? []) {
      discountAmount += discount.type === 'PERCENTAGE'
        ? base * (discount.value / 100)
        : discount.value;
    }

    if (discountAmount > base) {
      throw new BadRequestException('O desconto não pode superar o valor-base.');
    }

    const finalAmount = this.money(base - discountAmount);
    return {
      schemaVersion: 1,
      customerType: input.customerType,
      cycle: input.cycle,
      billingType: input.billingType ?? null,
      participants: input.customerType === CustomerType.COMPANY
        ? { contractedLives: quantity }
        : { dependentCount: quantity },
      pricing: {
        baseAmount: this.money(base),
        discountAmount: this.money(discountAmount),
        finalAmount,
        unitPrice: input.customerType === CustomerType.COMPANY
          ? this.money(input.unitPrice ?? input.baseAmount)
          : null,
        holderAmount: input.customerType === CustomerType.PERSON
          ? this.money(input.baseAmount)
          : null,
        dependentAmount: input.customerType === CustomerType.PERSON
          ? this.money(input.dependentAmount ?? 0)
          : null,
      },
      discounts: input.discounts ?? [],
      calculatedAt: new Date().toISOString(),
    };
  }

  private money(value: number) {
    return Number(value.toFixed(2));
  }
}
