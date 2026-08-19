import {
  AccessStatus,
  CheckoutStatus,
  FinancialStatus,
  InvoiceStatus,
  PaymentStatus,
  PrecheckoutStatus,
  SubscriptionStatus,
  WebhookStatus,
} from '../../database/entities';
import { WebhooksService } from './webhooks.service';

function repository(overrides: Record<string, any> = {}): any {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    save: jest.fn(async (value) => value),
    create: jest.fn((value) => ({ id: value.id || 'generated-id', ...value })),
    update: jest.fn(),
    ...overrides,
  };
}

function createService(options: Record<string, any> = {}) {
  const unitRepo = options.unitRepo || repository();
  const eventRepo = options.eventRepo || repository();
  const subRepo = options.subRepo || repository();
  const customerRepo = options.customerRepo || repository();
  const invoiceRepo = options.invoiceRepo || repository();
  const paymentRepo = options.paymentRepo || repository();
  const checkoutRepo = options.checkoutRepo || repository();
  const precheckoutRepo = options.precheckoutRepo || repository();
  const opportunityRepo = options.opportunityRepo || repository();
  const queue = options.queue || { add: jest.fn(), getJob: jest.fn() };
  const billing = options.billing || { verifyWebhookSecret: jest.fn() };
  const opportunities = options.opportunities || {
    convertByCheckout: jest.fn(),
    convertByExternalReference: jest.fn(),
  };
  const subscriptions = options.subscriptions || {
    markPastDue: jest.fn(),
    recoverIfCurrent: jest.fn(),
    transition: jest.fn(),
  };
  const lifecycle = options.lifecycle || { record: jest.fn().mockResolvedValue(undefined) };
  const service = new WebhooksService(
    unitRepo,
    eventRepo,
    subRepo,
    customerRepo,
    invoiceRepo,
    paymentRepo,
    checkoutRepo,
    precheckoutRepo,
    opportunityRepo,
    queue as any,
    billing as any,
    opportunities as any,
    subscriptions as any,
    lifecycle as any,
  );
  return { service, unitRepo, eventRepo, subRepo, customerRepo, invoiceRepo, paymentRepo, checkoutRepo, precheckoutRepo, opportunityRepo, queue, billing, opportunities, subscriptions, lifecycle };
}

describe('WebhooksService pós-venda', () => {

  it('CHECKOUT_PAID recorrente comercial não ativa antes da confirmação financeira', async () => {
    const checkout = {
      id: 'checkout-local', unitId: 'unit-1', opportunityId: 'opp-1', externalId: 'checkout-asaas',
      status: CheckoutStatus.PENDING, payload: { providerResourceType: 'CHECKOUT' },
    };
    const precheckout = {
      id: 'pre-1', unitId: 'unit-1', checkoutSessionId: 'checkout-local', status: PrecheckoutStatus.PAYMENT_PENDING,
    };
    const sub = {
      id: 'sub-local', unitId: 'unit-1', sourceOpportunityId: 'opp-1', primaryPersonId: 'person-1',
      externalSubscriptionId: 'asaas-subscription-current', status: SubscriptionStatus.ACTIVE,
    };
    const checkoutRepo = repository({ findOne: jest.fn().mockResolvedValue(checkout) });
    const precheckoutRepo = repository({ findOne: jest.fn().mockResolvedValue(precheckout) });
    const subRepo = repository({ findOne: jest.fn().mockResolvedValue(sub) });
    const { service, opportunities } = createService({ checkoutRepo, precheckoutRepo, subRepo });

    await (service as any).checkout({
      id: 'evt-checkout-paid', unitId: 'unit-1', eventType: 'CHECKOUT_PAID',
      payload: { checkout: { id: 'checkout-asaas', status: 'PAID' } },
    });

    expect(checkout.status).toBe(CheckoutStatus.PAID);
    expect(precheckout.status).toBe(PrecheckoutStatus.PAYMENT_PENDING);
    expect(sub.status).toBe(SubscriptionStatus.ACTIVE);
    expect(opportunities.convertByCheckout).not.toHaveBeenCalled();
  });

  it('SUBSCRIPTION_CREATED sem externalReference vincula a assinatura pelo checkoutSession', async () => {
    const sub = {
      id: 'sub-local', unitId: 'unit-1', sourceOpportunityId: 'opp-1', primaryPersonId: 'person-1',
      externalSubscriptionId: null, status: SubscriptionStatus.PENDING_PAYMENT,
    };
    const subRepo = repository({
      findOne: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(sub),
    });
    const checkoutRepo = repository({
      findOne: jest.fn().mockResolvedValue({ id: 'checkout-local', unitId: 'unit-1', opportunityId: 'opp-1', externalId: 'checkout-asaas' }),
    });
    const { service } = createService({ subRepo, checkoutRepo });

    const handled = await (service as any).subscription({
      id: 'evt-sub-created-checkout', unitId: 'unit-1', eventType: 'SUBSCRIPTION_CREATED',
      payload: {
        subscription: {
          id: 'asaas-sub-1', externalReference: null, checkoutSession: 'checkout-asaas', status: 'ACTIVE',
        },
      },
    });

    expect(handled).toBe(true);
    expect(sub.externalSubscriptionId).toBe('asaas-sub-1');
    expect(sub.status).toBe(SubscriptionStatus.PENDING_PAYMENT);
  });

  it('PAYMENT_CONFIRMED sem externalReference conclui a oportunidade usando checkoutSession', async () => {
    const pendingSub = {
      id: 'sub-local', unitId: 'unit-1', sourceOpportunityId: 'opp-1', primaryPersonId: 'person-1',
      externalSubscriptionId: null, status: SubscriptionStatus.PENDING_PAYMENT,
    };
    const activeSub = { ...pendingSub, externalSubscriptionId: 'asaas-sub-1', status: SubscriptionStatus.ACTIVE };
    const checkout = {
      id: 'checkout-local', unitId: 'unit-1', opportunityId: 'opp-1', externalId: 'checkout-asaas',
      status: CheckoutStatus.PAID, payload: { providerResourceType: 'CHECKOUT' },
    };
    const subRepo = repository({
      findOne: jest.fn()
        .mockResolvedValueOnce(null) // payment.subscription ainda não vinculado
        .mockResolvedValueOnce(pendingSub), // vínculo por checkoutSession -> opportunity
    });
    const checkoutRepo = repository({ findOne: jest.fn().mockResolvedValue(checkout) });
    const invoiceRepo = repository();
    const paymentRepo = repository();
    const opportunities = {
      convertByCheckout: jest.fn(),
      convertByExternalReference: jest.fn().mockResolvedValue(activeSub),
    };
    const { service, subscriptions } = createService({ subRepo, checkoutRepo, invoiceRepo, paymentRepo, opportunities });

    await (service as any).payment({
      id: 'evt-payment-confirmed', unitId: 'unit-1', eventType: 'PAYMENT_CONFIRMED',
      payload: {
        payment: {
          id: 'pay-1', customer: 'cus-1', subscription: 'asaas-sub-1', checkoutSession: 'checkout-asaas',
          externalReference: null, status: 'CONFIRMED', value: 44.55, netValue: 42.73,
          dueDate: '2026-08-19', confirmedDate: '2026-08-18', billingType: 'CREDIT_CARD',
          transactionReceiptUrl: 'https://sandbox.asaas.com/comprovantes/teste',
        },
      },
    });

    expect(opportunities.convertByExternalReference).toHaveBeenCalledWith(
      'unit-1', 'opp-1', 'asaas-sub-1', 'evt-payment-confirmed',
    );
    const savedInvoices = invoiceRepo.save.mock.calls.map((call: any[]) => call[0]);
    expect(savedInvoices.some((invoice: any) => invoice.subscriptionId === 'sub-local' && invoice.status === InvoiceStatus.CONFIRMED)).toBe(true);
    expect(savedInvoices.some((invoice: any) => invoice.metadata?.transactionReceiptUrl)).toBe(true);
    expect(subscriptions.recoverIfCurrent).toHaveBeenCalledWith(activeSub, 'evt-payment-confirmed', expect.anything());
  });
  it('SUBSCRIPTION_CREATED apenas vincula a assinatura externa e não ativa antes do pagamento', async () => {
    const sub = {
      id: 'sub-local',
      unitId: 'unit-1',
      sourceOpportunityId: 'opp-1',
      primaryPersonId: 'person-1',
      externalSubscriptionId: null,
      status: SubscriptionStatus.PENDING_PAYMENT,
      financialStatus: FinancialStatus.UNKNOWN,
      accessStatus: AccessStatus.DISABLED,
    };
    const subRepo = repository({
      findOne: jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(sub),
    });
    const { service, opportunities } = createService({ subRepo });

    const handled = await (service as any).subscription({
      id: 'evt-sub-created',
      unitId: 'unit-1',
      eventType: 'SUBSCRIPTION_CREATED',
      payload: { subscription: { id: 'asaas-sub-1', externalReference: 'opp-1', status: 'ACTIVE' } },
    });

    expect(handled).toBe(true);
    expect(sub.externalSubscriptionId).toBe('asaas-sub-1');
    expect(sub.status).toBe(SubscriptionStatus.PENDING_PAYMENT);
    expect(opportunities.convertByExternalReference).not.toHaveBeenCalled();
  });

  it('evento PAYMENT_OVERDUE atrasado não rebaixa cobrança já confirmada nem suspende o assinante', async () => {
    const sub = {
      id: 'sub-1', unitId: 'unit-1', sourceOpportunityId: 'opp-1', primaryPersonId: 'person-1',
      externalSubscriptionId: 'asaas-sub-1', status: SubscriptionStatus.ACTIVE,
    };
    const invoice = {
      id: 'invoice-1', unitId: 'unit-1', subscriptionId: 'sub-1', billingCustomerId: 'bc-1',
      externalId: 'pay-1', status: InvoiceStatus.CONFIRMED, dueDate: '2026-08-10', amount: '100.00',
      paidAmount: '100.00', paidAt: new Date(), invoiceUrl: null, bankSlipUrl: null,
    };
    const payment = {
      id: 'payment-1', unitId: 'unit-1', invoiceId: 'invoice-1', externalId: 'pay-1',
      status: PaymentStatus.CONFIRMED, amount: '100.00', rawPayload: {},
    };
    const subRepo = repository({ findOne: jest.fn().mockResolvedValue(sub) });
    const invoiceRepo = repository({ findOne: jest.fn().mockResolvedValue(invoice) });
    const paymentRepo = repository({ findOne: jest.fn().mockResolvedValue(payment) });
    const { service, subscriptions } = createService({ subRepo, invoiceRepo, paymentRepo });

    await (service as any).payment({
      id: 'evt-overdue-late',
      unitId: 'unit-1',
      eventType: 'PAYMENT_OVERDUE',
      payload: {
        payment: {
          id: 'pay-1', subscription: 'asaas-sub-1', status: 'OVERDUE', value: 100,
          dueDate: '2026-08-10', externalReference: 'opp-1',
        },
      },
    });

    expect(invoice.status).toBe(InvoiceStatus.CONFIRMED);
    expect(payment.status).toBe(PaymentStatus.CONFIRMED);
    expect(subscriptions.markPastDue).not.toHaveBeenCalled();
  });

  it('deduplica webhook repetido antes de qualquer nova conversão de assinante ou venda', async () => {
    const event: any = {
      id: 'event-1', unitId: 'unit-1', providerEventId: 'evt-provider-1',
      deduplicationKey: 'hash', eventType: 'PAYMENT_CONFIRMED', status: WebhookStatus.RECEIVED,
      payload: { id: 'evt-provider-1', event: 'PAYMENT_CONFIRMED', payment: { id: 'pay-1' } },
      headers: {}, attempts: 0, nextRetryAt: null,
    };
    const unitRepo = repository({ findOne: jest.fn().mockResolvedValue({ id: 'unit-1', slug: 'matriz', active: true }) });
    const eventRepo = repository({
      findOne: jest.fn().mockResolvedValueOnce(null).mockImplementation(async () => event),
      create: jest.fn(() => event),
      save: jest.fn(async value => value),
    });
    const queue = { add: jest.fn().mockResolvedValue(undefined), getJob: jest.fn() };
    const billing = { verifyWebhookSecret: jest.fn().mockResolvedValue(true) };
    const opportunities = { convertByCheckout: jest.fn(), convertByExternalReference: jest.fn() };
    const { service } = createService({ unitRepo, eventRepo, queue, billing, opportunities });
    const payload = { id: 'evt-provider-1', event: 'PAYMENT_CONFIRMED', payment: { id: 'pay-1' } };

    const first = await service.receive('matriz', payload, { 'asaas-access-token': 'secret' });
    const second = await service.receive('matriz', payload, { 'asaas-access-token': 'secret' });

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(opportunities.convertByCheckout).not.toHaveBeenCalled();
    expect(opportunities.convertByExternalReference).not.toHaveBeenCalled();
  });

  it('não reprocessa evento já marcado como processado', async () => {
    const eventRepo = repository({
      findOne: jest.fn().mockResolvedValue({ id: 'event-processed', status: WebhookStatus.PROCESSED }),
    });
    const opportunities = { convertByCheckout: jest.fn(), convertByExternalReference: jest.fn() };
    const { service } = createService({ eventRepo, opportunities });

    const result = await service.process('event-processed');

    expect(result).toEqual({ processed: true, ignored: false });
    expect(opportunities.convertByCheckout).not.toHaveBeenCalled();
    expect(opportunities.convertByExternalReference).not.toHaveBeenCalled();
  });

});
