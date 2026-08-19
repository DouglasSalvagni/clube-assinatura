import { ConflictException } from '@nestjs/common';
import {
  AccessStatus,
  BillingCycle,
  BillingType,
  CustomerType,
  FinancialStatus,
  InvoiceStatus,
  SubscriptionStatus,
} from '../../database/entities';
import { SubscriptionsService } from './subscriptions.service';

function repository(overrides: Record<string, any> = {}): any {
  return {
    find: jest.fn().mockResolvedValue([]),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    findOne: jest.fn().mockResolvedValue(null),
    findOneByOrFail: jest.fn(),
    exists: jest.fn().mockResolvedValue(false),
    count: jest.fn().mockResolvedValue(0),
    save: jest.fn(async (value) => value),
    create: jest.fn((value) => value),
    createQueryBuilder: jest.fn(),
    ...overrides,
  };
}

function subscription(overrides: Record<string, any> = {}) {
  return {
    id: 'sub-1',
    unitId: 'unit-1',
    primaryPersonId: 'person-1',
    planPriceId: null,
    sourceOpportunityId: 'opp-1',
    externalSubscriptionId: 'asaas-sub-1',
    status: SubscriptionStatus.ACTIVE,
    financialStatus: FinancialStatus.CURRENT,
    accessStatus: AccessStatus.ENABLED,
    startedAt: new Date(),
    firstActiveAt: new Date(),
    cancelledAt: null,
    cancellationScheduledAt: null,
    metadata: {},
    ...overrides,
  } as any;
}

function createService(options: Record<string, any> = {}) {
  const subRepo = options.subRepo || repository();
  const memberRepo = options.memberRepo || repository();
  const personRepo = options.personRepo || repository();
  const priceRepo = options.priceRepo || repository();
  const planRepo = options.planRepo || repository();
  const unitRepo = options.unitRepo || repository();
  const customerRepo = options.customerRepo || repository();
  const invoiceRepo = options.invoiceRepo || repository();
  const contractRepo = options.contractRepo || repository();
  const lifecycleRepo = options.lifecycleRepo || repository();
  const asaas = options.asaas || {
    createSubscription: jest.fn(),
    deleteSubscription: jest.fn(),
    updatePayment: jest.fn(),
    deletePayment: jest.fn(),
    updateCustomer: jest.fn(),
  };
  const lifecycle = options.lifecycle || { record: jest.fn().mockResolvedValue(undefined) };
  return {
    service: new SubscriptionsService(
      subRepo,
      memberRepo,
      personRepo,
      priceRepo,
      planRepo,
      unitRepo,
      customerRepo,
      invoiceRepo,
      contractRepo,
      lifecycleRepo,
      asaas,
      lifecycle,
    ),
    subRepo,
    memberRepo,
    personRepo,
    priceRepo,
    planRepo,
    unitRepo,
    customerRepo,
    invoiceRepo,
    contractRepo,
    lifecycleRepo,
    asaas,
    lifecycle,
  };
}

describe('SubscriptionsService pós-venda', () => {
  it('ativa PENDING_PAYMENT somente quando não existe cobrança vencida', async () => {
    const sub = subscription({
      status: SubscriptionStatus.PENDING_PAYMENT,
      financialStatus: FinancialStatus.UNKNOWN,
      accessStatus: AccessStatus.DISABLED,
      startedAt: null,
      firstActiveAt: null,
    });
    const invoiceRepo = repository({
      count: jest.fn().mockResolvedValue(0),
      findOne: jest.fn().mockResolvedValue({
        externalId: 'pay-first',
        status: InvoiceStatus.CONFIRMED,
        paidAt: new Date('2026-08-18T12:00:00.000Z'),
      }),
    });
    const { service, lifecycle } = createService({ invoiceRepo });

    const result = await service.recoverIfCurrent(sub, 'evt-first-payment');

    expect(result).toEqual({ recovered: true, overdueCount: 0 });
    expect(sub.status).toBe(SubscriptionStatus.ACTIVE);
    expect(sub.financialStatus).toBe(FinancialStatus.CURRENT);
    expect(sub.accessStatus).toBe(AccessStatus.ENABLED);
    expect(lifecycle.record).toHaveBeenCalledWith(expect.objectContaining({
      fromStatus: SubscriptionStatus.PENDING_PAYMENT,
      toStatus: SubscriptionStatus.ACTIVE,
      reasonCode: 'FIRST_PAYMENT_CONFIRMED',
      correlationId: 'evt-first-payment',
    }));
  });

  it('não recupera uma assinatura enquanto ainda existir cobrança vencida', async () => {
    const sub = subscription({ status: SubscriptionStatus.PAST_DUE, financialStatus: FinancialStatus.OVERDUE });
    const invoiceRepo = repository({ count: jest.fn().mockResolvedValue(1) });
    const { service, lifecycle } = createService({ invoiceRepo });

    const result = await service.recoverIfCurrent(sub, 'evt-1');

    expect(result).toEqual({ recovered: false, overdueCount: 1, reason: 'OVERDUE_INVOICES' });
    expect(sub.status).toBe(SubscriptionStatus.PAST_DUE);
    expect(lifecycle.record).not.toHaveBeenCalled();
  });

  it('não reativa inadimplente apenas porque a cobrança consolidada deixou de estar vencida', async () => {
    const sub = subscription({
      status: SubscriptionStatus.PAST_DUE,
      financialStatus: FinancialStatus.OVERDUE,
      accessStatus: AccessStatus.RESTRICTED,
      metadata: { pastDueSince: '2026-08-10T12:00:00.000Z' },
    });
    const invoiceRepo = repository({
      count: jest.fn().mockResolvedValue(0),
      findOne: jest.fn().mockResolvedValue(null),
    });
    const { service } = createService({ invoiceRepo });

    const result = await service.recoverIfCurrent(sub, 'evt-reconcile');

    expect(result).toEqual({ recovered: false, overdueCount: 0, reason: 'PAYMENT_CONFIRMATION_REQUIRED' });
    expect(sub.status).toBe(SubscriptionStatus.PAST_DUE);
  });

  it('reativa assinatura cancelada usando o snapshot histórico, sem consultar preço global', async () => {
    const sub = subscription({
      status: SubscriptionStatus.CANCELLED,
      financialStatus: FinancialStatus.UNKNOWN,
      accessStatus: AccessStatus.DISABLED,
      metadata: {
        customerType: CustomerType.PERSON,
        negotiationSnapshot: {
          customerType: CustomerType.PERSON,
          cycle: BillingCycle.MONTHLY,
          allowedBillingTypes: [BillingType.BOLETO],
          pricing: { finalAmount: 123.45 },
        },
      },
    });
    const subRepo = repository({ findOne: jest.fn().mockResolvedValue(sub) });
    const customerRepo = repository({ findOne: jest.fn().mockResolvedValue({ externalId: 'cus-1' }) });
    const priceRepo = repository({ findOne: jest.fn().mockResolvedValue({ amount: '999.99' }) });
    const asaas = {
      createSubscription: jest.fn().mockResolvedValue({ id: 'new-sub' }),
      deleteSubscription: jest.fn(),
      updatePayment: jest.fn(),
      deletePayment: jest.fn(),
      updateCustomer: jest.fn(),
    };
    const { service } = createService({ subRepo, customerRepo, priceRepo, asaas });

    await service.reactivate('unit-1', 'sub-1', { id: 'user-1' } as any);

    expect(asaas.createSubscription).toHaveBeenCalledWith('unit-1', expect.objectContaining({
      value: 123.45,
      cycle: BillingCycle.MONTHLY,
      billingType: BillingType.BOLETO,
    }));
    expect(priceRepo.findOne).not.toHaveBeenCalled();
    expect(sub.status).toBe(SubscriptionStatus.PENDING_PAYMENT);
  });

  it('consolida cobranças vencidas atualizando uma cobrança existente e removendo as demais', async () => {
    const sub = subscription({ status: SubscriptionStatus.PAST_DUE });
    const subRepo = repository({ findOne: jest.fn().mockResolvedValue(sub) });
    const overdue = [
      { id: 'inv-1', unitId: 'unit-1', subscriptionId: 'sub-1', externalId: 'pay-1', status: InvoiceStatus.OVERDUE, amount: '100.00', dueDate: '2026-08-01', invoiceUrl: null, bankSlipUrl: null, metadata: {} },
      { id: 'inv-2', unitId: 'unit-1', subscriptionId: 'sub-1', externalId: 'pay-2', status: InvoiceStatus.OVERDUE, amount: '80.00', dueDate: '2026-08-02', invoiceUrl: null, bankSlipUrl: null, metadata: {} },
      { id: 'inv-3', unitId: 'unit-1', subscriptionId: 'sub-1', externalId: 'pay-3', status: InvoiceStatus.OVERDUE, amount: '20.00', dueDate: '2026-08-03', invoiceUrl: null, bankSlipUrl: null, metadata: {} },
    ];
    const invoiceRepo = repository({ find: jest.fn().mockResolvedValue(overdue) });
    const asaas = {
      updatePayment: jest.fn().mockResolvedValue({ invoiceUrl: 'https://invoice', bankSlipUrl: 'https://boleto' }),
      deletePayment: jest.fn().mockResolvedValue({}),
      deleteSubscription: jest.fn(),
      createSubscription: jest.fn(),
      updateCustomer: jest.fn(),
    };
    const { service } = createService({ subRepo, invoiceRepo, asaas });

    const result = await service.settleDebts('unit-1', 'sub-1', { dueDate: '2026-08-20' }, { id: 'user-1' } as any);

    expect(asaas.updatePayment).toHaveBeenCalledWith('unit-1', 'pay-1', expect.objectContaining({ value: 200, dueDate: '2026-08-20' }));
    expect(asaas.deletePayment).toHaveBeenCalledTimes(2);
    expect(result.total).toBe(200);
    expect(overdue[1].status).toBe(InvoiceStatus.CANCELLED);
    expect(overdue[2].status).toBe(InvoiceStatus.CANCELLED);
  });

  it('permite cadastrar dependente já contratado após aditivo, inclusive em plano anual', async () => {
    const sub = subscription({
      metadata: {
        contractId: 'contract-1',
        negotiationSnapshot: {
          customerType: CustomerType.PERSON,
          cycle: BillingCycle.YEARLY,
          participants: { dependentCount: 2 },
          pricing: { finalAmount: 100 },
        },
      },
    });
    const subRepo = repository({ findOne: jest.fn().mockResolvedValue(sub) });
    const memberRepo = repository({ count: jest.fn().mockResolvedValue(1) });
    const personRepo = repository({ exists: jest.fn().mockResolvedValue(false) });
    const { service, lifecycle } = createService({ subRepo, memberRepo, personRepo });

    await expect(service.addDependent('unit-1', 'sub-1', { nome: 'Dependente', cpf: '52998224725' }, 'user-1'))
      .resolves.toEqual(expect.objectContaining({ nome: 'Dependente' }));
    expect(memberRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      subscriptionId: 'sub-1',
      role: 'DEPENDENT',
    }));
    expect(lifecycle.record).toHaveBeenCalledWith(expect.objectContaining({ type: 'member.added' }));
  });

  it('exige alteração contratual apenas ao ultrapassar a quantidade de dependentes contratada', async () => {
    const sub = subscription({
      metadata: {
        contractId: 'contract-1',
        negotiationSnapshot: {
          customerType: CustomerType.PERSON,
          cycle: BillingCycle.MONTHLY,
          participants: { dependentCount: 2 },
          pricing: { finalAmount: 100 },
        },
      },
    });
    const subRepo = repository({ findOne: jest.fn().mockResolvedValue(sub) });
    const memberRepo = repository({ count: jest.fn().mockResolvedValue(2) });
    const { service } = createService({ subRepo, memberRepo });

    await expect(service.addDependent('unit-1', 'sub-1', { nome: 'Dependente', cpf: '52998224725' }, 'user-1'))
      .rejects.toThrow('O contrato permite no máximo 2 dependente(s) ativo(s)');
  });

  it('impede PJ de cadastrar beneficiário acima das vidas contratadas', async () => {
    const sub = subscription({
      metadata: {
        customerType: CustomerType.COMPANY,
        contractedLives: 2,
        negotiationSnapshot: {
          customerType: CustomerType.COMPANY,
          cycle: BillingCycle.MONTHLY,
          participants: { contractedLives: 2 },
          pricing: { finalAmount: 200 },
        },
      },
    });
    const subRepo = repository({ findOne: jest.fn().mockResolvedValue(sub) });
    const memberRepo = repository({ count: jest.fn().mockResolvedValue(2) });
    const personRepo = repository({ exists: jest.fn().mockResolvedValue(false) });
    const { service } = createService({ subRepo, memberRepo, personRepo });

    await expect(service.addDependent('unit-1', 'sub-1', { nome: 'Beneficiário', cpf: '52998224725' }, 'user-1'))
      .rejects.toThrow('O contrato permite no máximo 2 beneficiários ativos.');
  });

  it('suspende automaticamente após o fim da carência quando a dívida permanece vencida', async () => {
    const sub = subscription({
      status: SubscriptionStatus.PAST_DUE,
      financialStatus: FinancialStatus.OVERDUE,
      accessStatus: AccessStatus.RESTRICTED,
      metadata: { suspensionDueAt: '2026-08-01T00:00:00.000Z' },
    });
    const subRepo = repository({ find: jest.fn().mockResolvedValue([sub]) });
    const invoiceRepo = repository({ count: jest.fn().mockResolvedValue(1) });
    const { service, lifecycle } = createService({ subRepo, invoiceRepo });

    const result = await service.enforceDelinquencyGrace();

    expect(result.suspended).toBe(1);
    expect(sub.status).toBe(SubscriptionStatus.SUSPENDED);
    expect(sub.accessStatus).toBe(AccessStatus.DISABLED);
    expect(lifecycle.record).toHaveBeenCalledWith(expect.objectContaining({
      reasonCode: 'DELINQUENCY_GRACE_EXPIRED',
    }));
  });


  it('move ACTIVE para PAST_DUE e depois recupera quando há pagamento confirmado atual', async () => {
    const sub = subscription({
      status: SubscriptionStatus.ACTIVE,
      financialStatus: FinancialStatus.CURRENT,
      accessStatus: AccessStatus.ENABLED,
      metadata: {},
    });
    const invoiceRepo = repository({
      count: jest.fn().mockResolvedValue(0),
      findOne: jest.fn().mockResolvedValue({
        externalId: 'pay-recovery',
        status: InvoiceStatus.CONFIRMED,
        paidAt: new Date(Date.now() + 1_000),
      }),
    });
    const unitRepo = repository({ findOne: jest.fn().mockResolvedValue({ settings: { delinquencyGraceDays: 5 } }) });
    const { service, lifecycle } = createService({ invoiceRepo, unitRepo });

    await service.markPastDue(sub, { paymentId: 'pay-overdue', correlationId: 'evt-overdue' });
    expect(sub.status).toBe(SubscriptionStatus.PAST_DUE);
    expect(sub.financialStatus).toBe(FinancialStatus.OVERDUE);
    expect(sub.accessStatus).toBe(AccessStatus.RESTRICTED);
    expect(sub.metadata.suspensionDueAt).toBeTruthy();

    const recovered = await service.recoverIfCurrent(sub, 'evt-paid');
    expect(recovered.recovered).toBe(true);
    expect(sub.status).toBe(SubscriptionStatus.ACTIVE);
    expect(sub.financialStatus).toBe(FinancialStatus.CURRENT);
    expect(sub.accessStatus).toBe(AccessStatus.ENABLED);
    expect(sub.metadata.pastDueSince).toBeNull();
    expect(lifecycle.record).toHaveBeenCalledWith(expect.objectContaining({ reasonCode: 'PAYMENT_RECOVERED' }));
  });

  it('cancela assinatura no Asaas e torna repetição idempotente', async () => {
    const sub = subscription({ status: SubscriptionStatus.ACTIVE, externalSubscriptionId: 'asaas-sub-cancel' });
    const subRepo = repository({ findOne: jest.fn().mockResolvedValue(sub) });
    const asaas = {
      createSubscription: jest.fn(),
      deleteSubscription: jest.fn().mockResolvedValue({}),
      updatePayment: jest.fn(),
      deletePayment: jest.fn(),
      updateCustomer: jest.fn(),
    };
    const { service } = createService({ subRepo, asaas });
    const actor = { id: 'user-1' } as any;

    const first = await service.cancel('unit-1', 'sub-1', { reason: 'Cancelamento solicitado pelo cliente' }, actor);
    const second = await service.cancel('unit-1', 'sub-1', { reason: 'Cancelamento solicitado pelo cliente' }, actor);

    expect(first.success).toBe(true);
    expect(second).toEqual({ success: true, idempotent: true });
    expect(asaas.deleteSubscription).toHaveBeenCalledTimes(1);
    expect(sub.status).toBe(SubscriptionStatus.CANCELLED);
  });

});
