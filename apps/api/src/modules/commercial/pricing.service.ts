import { BadRequestException, Injectable } from '@nestjs/common';
import { BillingCycle, CustomerType } from '../../database/entities';
import { SimulateNegotiationDto } from './commercial.dto';

@Injectable()
export class PricingService {
  calculate(input: SimulateNegotiationDto) {
    this.validateCycle(input.customerType, input.cycle);

    const quantity = input.customerType === CustomerType.COMPANY
      ? input.lives ?? 1
      : input.dependentCount ?? 0;
    const minimumQuantity = input.customerType === CustomerType.COMPANY ? 1 : 0;
    if (!Number.isInteger(quantity) || quantity < minimumQuantity) {
      throw new BadRequestException(
        input.customerType === CustomerType.COMPANY
          ? 'A quantidade de vidas deve ser um número inteiro maior que zero.'
          : 'A quantidade de dependentes deve ser um número inteiro maior ou igual a zero.',
      );
    }

    const holderCents = this.toCents(input.baseAmount, 'O valor do titular');
    const dependentCents = this.toCents(input.dependentAmount ?? 0, 'O valor do dependente');
    const unitPriceCents = this.toCents(
      input.unitPrice ?? input.baseAmount,
      'O preço por vida',
    );

    const monthlySubtotalCents = input.customerType === CustomerType.COMPANY
      ? unitPriceCents * quantity
      : holderCents + dependentCents * quantity;
    const periodMultiplier = input.cycle === BillingCycle.YEARLY ? 12 : 1;
    const grossPeriodCents = monthlySubtotalCents * periodMultiplier;

    const configuredAnnualDiscountPercent = input.customerType === CustomerType.PERSON
      && input.cycle === BillingCycle.YEARLY
      ? this.validatePercent(input.annualDiscountPercent ?? 0, 'O desconto anual')
      : 0;

    const annualDiscountCents = this.percentOf(grossPeriodCents, configuredAnnualDiscountPercent);
    const negotiationBaseCents = grossPeriodCents - annualDiscountCents;

    let commercialDiscountCents = 0;
    for (const discount of input.discounts ?? []) {
      if (!['PERCENTAGE', 'FIXED'].includes(discount.type)) {
        throw new BadRequestException('O tipo do desconto comercial é inválido.');
      }
      const value = discount.type === 'PERCENTAGE'
        ? this.validatePercent(discount.value, 'O desconto comercial')
        : Number(discount.value);
      commercialDiscountCents += discount.type === 'PERCENTAGE'
        ? this.percentOf(negotiationBaseCents, value)
        : this.toCents(value, 'O desconto comercial');
    }

    if (commercialDiscountCents > negotiationBaseCents) {
      throw new BadRequestException('O desconto comercial não pode superar o valor-base da negociação.');
    }

    const finalCents = negotiationBaseCents - commercialDiscountCents;
    return {
      schemaVersion: 2,
      customerType: input.customerType,
      cycle: input.cycle,
      billingType: input.billingType ?? null,
      participants: input.customerType === CustomerType.COMPANY
        ? { contractedLives: quantity }
        : { dependentCount: quantity },
      pricing: {
        baseAmount: this.fromCents(negotiationBaseCents),
        monthlySubtotal: this.fromCents(monthlySubtotalCents),
        periodMultiplier,
        grossPeriodAmount: this.fromCents(grossPeriodCents),
        annualDiscountPercent: configuredAnnualDiscountPercent,
        annualDiscountAmount: this.fromCents(annualDiscountCents),
        negotiationBaseAmount: this.fromCents(negotiationBaseCents),
        discountAmount: this.fromCents(commercialDiscountCents),
        commercialDiscountAmount: this.fromCents(commercialDiscountCents),
        finalAmount: this.fromCents(finalCents),
        monthlyEquivalent: this.fromCents(
          input.cycle === BillingCycle.YEARLY ? Math.round(finalCents / 12) : finalCents,
        ),
        unitPrice: input.customerType === CustomerType.COMPANY
          ? this.fromCents(unitPriceCents)
          : null,
        holderAmount: input.customerType === CustomerType.PERSON
          ? this.fromCents(holderCents)
          : null,
        dependentAmount: input.customerType === CustomerType.PERSON
          ? this.fromCents(dependentCents)
          : null,
      },
      discounts: input.discounts ?? [],
      calculatedAt: new Date().toISOString(),
    };
  }

  private validateCycle(customerType: CustomerType, cycle: BillingCycle) {
    if (customerType === CustomerType.COMPANY && cycle !== BillingCycle.MONTHLY) {
      throw new BadRequestException('Pessoa jurídica utiliza somente cobrança mensal.');
    }
    if (customerType === CustomerType.PERSON
      && ![BillingCycle.MONTHLY, BillingCycle.YEARLY].includes(cycle)) {
      throw new BadRequestException('Pessoa física deve utilizar periodicidade mensal ou anual.');
    }
  }

  private percentOf(cents: number, percent: number) {
    return Math.round(cents * percent / 100);
  }

  private validatePercent(value: number, label: string) {
    const normalized = Number(value);
    if (!Number.isFinite(normalized) || normalized < 0 || normalized > 100) {
      throw new BadRequestException(`${label} deve estar entre 0% e 100%.`);
    }
    return normalized;
  }

  private toCents(value: number, label = 'O valor') {
    const normalized = Number(value);
    if (!Number.isFinite(normalized) || normalized < 0) {
      throw new BadRequestException(`${label} deve ser um número maior ou igual a zero.`);
    }
    return Math.round(normalized * 100);
  }

  private fromCents(value: number) {
    return Number((value / 100).toFixed(2));
  }
}
