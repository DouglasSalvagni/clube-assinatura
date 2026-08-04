import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  ApprovalStatus,
  BillingType,
  CommercialStatus,
  ContractStatus,
  CustomerType,
  GlobalRole,
  PrecheckoutStatus,
  UnitRole,
} from '../../database/entities';
import { CommercialWorkflowService } from './commercial-workflow.service';

function repository(overrides: Record<string, jest.Mock> = {}): any {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    findOneByOrFail: jest.fn(),
    save: jest.fn(async (value) => value),
    create: jest.fn((value) => value),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    ...overrides,
  };
}

function createService(options: {
  opportunities?: any;
  sessions?: any;
  policies?: any;
  approvals?: any;
  feature?: any;
  contracts?: any;
  people?: any;
  participants?: any;
  opportunityMembers?: any;
  billingCustomers?: any;
  checkoutSessions?: any;
  subscriptions?: any;
  pricing?: any;
  asaas?: any;
} = {}) {
  const policies = options.policies || repository({ find: jest.fn().mockResolvedValue([]) });
  const approvals = options.approvals || repository({ find: jest.fn().mockResolvedValue([]) });
  const opportunities = options.opportunities || repository();
  const sessions = options.sessions || repository();
  const contracts = options.contracts || repository();
  const people = options.people || repository({
    findOneByOrFail: jest.fn().mockResolvedValue({
      id: 'person-1', name: 'Cliente', taxId: '52998224725', email: 'cliente@example.com',
      phone: '51999999999', whatsapp: null, postalCode: '90000000', address: 'Rua A',
      addressNumber: '100', complement: null, district: 'Centro', city: 'Porto Alegre', state: 'RS',
    }),
    find: jest.fn().mockResolvedValue([]),
  });
  const participants = options.participants || repository();
  const opportunityMembers = options.opportunityMembers || repository({ find: jest.fn().mockResolvedValue([]) });
  const billingCustomers = options.billingCustomers || repository();
  const checkoutSessions = options.checkoutSessions || repository();
  const subscriptions = options.subscriptions || repository();
  const service = new CommercialWorkflowService(
    policies,
    approvals,
    opportunities,
    people,
    contracts,
    repository(), // acceptances
    sessions,
    participants,
    opportunityMembers,
    repository(), // team members
    repository(), // offer versions
    repository(), // template versions
    repository(), // audit logs
    billingCustomers,
    checkoutSessions,
    subscriptions,
    options.pricing || { calculate: jest.fn() } as any,
    options.asaas || { createCheckout: jest.fn() } as any,
    options.feature || { assertEnabled: jest.fn() },
  );
  return {
    service, policies, approvals, opportunities, people, participants, opportunityMembers, sessions, contracts,
    billingCustomers, checkoutSessions, subscriptions,
  };
}

describe('CommercialWorkflowService', () => {
  it('expira uma sessão cujo prazo terminou', async () => {
    const expired = {
      id: 'session-1',
      tokenHash: 'hash',
      status: PrecheckoutStatus.CREATED,
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    };
    const sessions = repository({
      findOne: jest.fn().mockResolvedValue(expired),
      save: jest.fn().mockImplementation(async (value) => value),
    });
    const { service } = createService({ sessions });
    jest.spyOn(service as any, 'hash').mockReturnValue('hash');

    await expect((service as any).byToken('token')).rejects.toBeInstanceOf(BadRequestException);
    expect(expired.status).toBe(PrecheckoutStatus.EXPIRED);
    expect(sessions.save).toHaveBeenCalledWith(expired);
  });

  it('impede pré-checkout de PJ sem aprovação', async () => {
    const opportunity = {
      id: 'opportunity-1',
      unitId: 'unit-1',
      customerType: CustomerType.COMPANY,
      commercialStatus: CommercialStatus.NEGOTIATION,
      ownerUserId: 'user-1',
      negotiationSnapshot: {},
    };
    const opportunities = repository({
      findOne: jest.fn().mockResolvedValue(opportunity),
    });
    const { service } = createService({ opportunities });

    await expect(service.createPrecheckout(
      'unit-1',
      'opportunity-1',
      7,
      'user-1',
      UnitRole.SALES,
      GlobalRole.STANDARD,
    )).rejects.toThrow('A negociação jurídica precisa estar aprovada.');
  });

  it('revoga links anteriores antes de emitir um novo link', async () => {
    const previous = {
      id: 'session-old',
      unitId: 'unit-1',
      opportunityId: 'opportunity-1',
      status: PrecheckoutStatus.CREATED,
      revokedAt: null,
    };
    const opportunity = {
      id: 'opportunity-1',
      unitId: 'unit-1',
      customerType: CustomerType.PERSON,
      commercialStatus: CommercialStatus.NEGOTIATION,
      ownerUserId: 'user-1',
      negotiationSnapshot: {
        customerType: CustomerType.PERSON,
        discounts: [],
        pricing: { discountAmount: 0 },
      },
    };
    const opportunities = repository({
      findOne: jest.fn().mockResolvedValue(opportunity),
    });
    const sessions = repository({
      find: jest.fn().mockResolvedValue([previous]),
      save: jest.fn().mockImplementation(async (value) => ({ id: value.id || 'session-new', ...value })),
    });
    const { service } = createService({ opportunities, sessions });
    jest.spyOn(service as any, 'assertOpportunityAccess').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'audit').mockResolvedValue(undefined);

    const result = await service.createPrecheckout(
      'unit-1',
      'opportunity-1',
      7,
      'user-1',
      UnitRole.SALES,
      GlobalRole.STANDARD,
    );

    expect(previous.status).toBe(PrecheckoutStatus.REVOKED);
    expect(previous.revokedAt).toBeInstanceOf(Date);
    expect(result.url).toMatch(/^\/checkout\//);
  });


  it('leva dependentes cadastrados e o valor recalculado para o pré-checkout PF', async () => {
    const opportunity = {
      id: 'opportunity-1',
      unitId: 'unit-1',
      primaryPersonId: 'holder-1',
      customerType: CustomerType.PERSON,
      commercialStatus: CommercialStatus.NEGOTIATION,
      ownerUserId: 'user-1',
      billingCycle: 'MONTHLY',
      billingType: BillingType.CREDIT_CARD,
      expectedValue: '100.00',
      negotiationSnapshot: {
        customerType: CustomerType.PERSON,
        cycle: 'MONTHLY',
        billingType: BillingType.CREDIT_CARD,
        allowedBillingTypes: [BillingType.CREDIT_CARD],
        participants: { dependentCount: 0 },
        pricing: { holderAmount: 100, dependentAmount: 25, finalAmount: 100 },
        discounts: [],
      },
    };
    const opportunities = repository({
      findOne: jest.fn().mockResolvedValue(opportunity),
      save: jest.fn().mockImplementation(async value => value),
    });
    const people = repository({
      findOneByOrFail: jest.fn().mockResolvedValue({
        id: 'holder-1', name: 'Titular', taxId: '52998224725', email: 'titular@example.com',
        phone: '51999999999', whatsapp: null, postalCode: '90000000', address: 'Rua A',
        addressNumber: '100', complement: null, district: 'Centro', city: 'Porto Alegre', state: 'RS',
      }),
      find: jest.fn().mockResolvedValue([
        { id: 'dependent-person-1', name: 'Dependente', taxId: '11144477735', birthDate: null },
      ]),
    });
    const opportunityMembers = repository({
      find: jest.fn().mockResolvedValue([
        { id: 'member-1', personId: 'dependent-person-1', relationship: 'Filho' },
      ]),
    });
    const participants = repository({
      save: jest.fn().mockImplementation(async value => value),
      create: jest.fn(value => value),
    });
    const sessions = repository({
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation(async value => ({ id: 'session-1', ...value })),
    });
    const pricing = {
      calculate: jest.fn().mockReturnValue({
        schemaVersion: 1,
        customerType: CustomerType.PERSON,
        cycle: 'MONTHLY',
        billingType: BillingType.CREDIT_CARD,
        participants: { dependentCount: 1 },
        pricing: { holderAmount: 100, dependentAmount: 25, baseAmount: 125, discountAmount: 0, finalAmount: 125 },
        discounts: [],
      }),
    };
    const { service } = createService({ opportunities, people, opportunityMembers, participants, sessions, pricing });
    jest.spyOn(service as any, 'assertOpportunityAccess').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'audit').mockResolvedValue(undefined);

    await service.createPrecheckout('unit-1', 'opportunity-1', 7, 'user-1', UnitRole.SALES, GlobalRole.STANDARD);

    expect(pricing.calculate).toHaveBeenCalledWith(expect.objectContaining({ dependentCount: 1 }));
    expect(opportunity.expectedValue).toBe('125.00');
    expect(participants.save).toHaveBeenCalledWith(expect.objectContaining({
      precheckoutSessionId: 'session-1',
      name: 'Dependente',
      relationship: 'Filho',
    }));
    expect(sessions.save).toHaveBeenCalledWith(expect.objectContaining({
      customerData: expect.objectContaining({ name: 'Titular', email: 'titular@example.com' }),
      pricingSnapshot: expect.objectContaining({ pricing: expect.objectContaining({ finalAmount: 125 }) }),
    }));
  });

  it('não consulta contratos de uma oportunidade de outra unidade', async () => {
    const opportunities = repository({
      findOne: jest.fn().mockResolvedValue(null),
    });
    const contracts = repository();
    const { service } = createService({ opportunities, contracts });

    await expect(service.listContracts(
      'unit-b',
      'opportunity-a',
      'admin-b',
      UnitRole.ADMIN,
      GlobalRole.STANDARD,
    )).rejects.toBeInstanceOf(NotFoundException);
    expect(opportunities.findOne).toHaveBeenCalledWith({
      where: { unitId: 'unit-b', id: 'opportunity-a' },
    });
    expect(contracts.find).not.toHaveBeenCalled();
  });

  it('cria aditivo versionado e um link exclusivo de aceite', async () => {
    const parent = {
      id: 'contract-1',
      unitId: 'unit-1',
      opportunityId: 'opportunity-1',
      version: 1,
      status: 'ACCEPTED',
      templateCode: 'PF',
      templateVersionId: 'template-version-1',
      contentHash: 'a'.repeat(64),
      snapshot: {
        customer: { name: 'Cliente' },
        participants: [],
        negotiation: {
          cycle: 'MONTHLY',
          pricing: { holderAmount: 100, dependentAmount: 20, finalAmount: 100 },
          participants: { dependentCount: 0 },
          discounts: [],
          allowedBillingTypes: ['CREDIT_CARD'],
        },
      },
    };
    const opportunity = {
      id: 'opportunity-1',
      unitId: 'unit-1',
      customerType: CustomerType.PERSON,
      ownerUserId: 'admin-1',
      billingCycle: 'MONTHLY',
      billingType: 'CREDIT_CARD',
      expectedValue: '100.00',
      negotiationSnapshot: parent.snapshot.negotiation,
    };
    const opportunities = repository({
      findOne: jest.fn().mockResolvedValue(opportunity),
    });
    const contracts = repository({
      findOne: jest.fn().mockResolvedValue(parent),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation(async (value) => ({ id: 'contract-2', ...value })),
    });
    const sessions = repository({
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation(async (value) => ({ id: 'session-2', ...value })),
    });
    const pricing = {
      calculate: jest.fn().mockReturnValue({
        schemaVersion: 1,
        customerType: CustomerType.PERSON,
        cycle: 'MONTHLY',
        billingType: 'CREDIT_CARD',
        participants: { dependentCount: 0 },
        pricing: { holderAmount: 110, dependentAmount: 20, baseAmount: 110, discountAmount: 0, finalAmount: 110 },
        discounts: [],
      }),
    };
    const { service } = createService({ opportunities, contracts, sessions, pricing });
    jest.spyOn(service as any, 'audit').mockResolvedValue(undefined);

    const result = await service.createContractRevision(
      'unit-1',
      'contract-1',
      {
        relationType: 'AMENDMENT' as any,
        reason: 'Atualização do valor mensal',
        changes: { holderAmount: 110 },
        requiresPayment: false,
      },
      'admin-1',
      UnitRole.ADMIN,
      GlobalRole.STANDARD,
    );

    expect(result.contract.parentContractId).toBe('contract-1');
    expect(result.contract.version).toBe(2);
    expect(result.contract.requiresPayment).toBe(false);
    expect(result.precheckout.url).toMatch(/^\/checkout\//);
    expect(pricing.calculate).toHaveBeenCalled();
  });

  it('usa somente meios aceitos pelo Checkout hospedado e envia customerData', async () => {
    const session = {
      id: 'precheckout-1',
      unitId: 'unit-1',
      opportunityId: 'opportunity-1',
      contractId: 'contract-1',
      checkoutSessionId: null,
      status: PrecheckoutStatus.ACCEPTED,
      customerData: {},
      pricingSnapshot: {
        cycle: 'MONTHLY',
        allowedBillingTypes: [BillingType.CREDIT_CARD],
        pricing: { finalAmount: 150 },
      },
    };
    const contract = { id: 'contract-1', unitId: 'unit-1', status: ContractStatus.ACCEPTED, requiresPayment: true };
    const opportunity = {
      id: 'opportunity-1', unitId: 'unit-1', primaryPersonId: 'person-1',
      billingCycle: 'MONTHLY', billingType: BillingType.CREDIT_CARD,
      negotiationSnapshot: {}, status: 'OPEN', commercialStatus: CommercialStatus.APPROVED,
    };
    const person = {
      id: 'person-1', name: 'Pessoa Teste', taxId: '52998224725', email: 'teste@example.com',
      phone: '51999999999', postalCode: '90010000', address: 'Rua A', addressNumber: '10',
      complement: null, district: 'Centro',
    };
    const opportunities = repository({ findOneByOrFail: jest.fn().mockResolvedValue(opportunity) });
    const people = repository({ findOneByOrFail: jest.fn().mockResolvedValue(person) });
    const contracts = repository({ findOneByOrFail: jest.fn().mockResolvedValue(contract) });
    const billingCustomers = repository({
      findOne: jest.fn().mockResolvedValue({ id: 'billing-customer-1', externalId: 'cus_1' }),
    });
    const checkoutSessions = repository({
      save: jest.fn().mockImplementation(async (value) => ({ id: 'checkout-local-1', ...value })),
    });
    const asaas = {
      createCheckout: jest.fn().mockResolvedValue({ id: 'checkout_asaas_1', link: 'https://asaas.example/checkout' }),
    };
    const { service } = createService({ opportunities, people, contracts, billingCustomers, checkoutSessions, asaas });
    jest.spyOn(service as any, 'byToken').mockResolvedValue(session);
    jest.spyOn(service as any, 'audit').mockResolvedValue(undefined);

    const result = await service.startAsaasCheckout('token', { billingType: BillingType.CREDIT_CARD });

    expect(result.checkoutLink).toBe('https://asaas.example/checkout');
    expect(asaas.createCheckout).toHaveBeenCalledWith('unit-1', expect.objectContaining({
      billingTypes: [BillingType.CREDIT_CARD],
      customerData: expect.objectContaining({ cpfCnpj: '52998224725' }),
      callback: expect.objectContaining({ expiredUrl: expect.any(String) }),
    }));
    expect(asaas.createCheckout.mock.calls[0][1]).not.toHaveProperty('customer');
  });

  it('gera boleto recorrente pela assinatura, sem enviar BOLETO ao Checkout hospedado', async () => {
    const session = {
      id: 'precheckout-2', unitId: 'unit-1', opportunityId: 'opportunity-2', contractId: 'contract-2',
      checkoutSessionId: null, status: PrecheckoutStatus.ACCEPTED, customerData: {},
      pricingSnapshot: {
        cycle: 'MONTHLY', allowedBillingTypes: [BillingType.BOLETO], pricing: { finalAmount: 200 },
      },
    };
    const contract = { id: 'contract-2', unitId: 'unit-1', status: ContractStatus.ACCEPTED, requiresPayment: true };
    const opportunity = {
      id: 'opportunity-2', unitId: 'unit-1', primaryPersonId: 'person-2',
      billingCycle: 'MONTHLY', billingType: BillingType.BOLETO, negotiationSnapshot: {},
      status: 'OPEN', commercialStatus: CommercialStatus.APPROVED,
    };
    const people = repository({
      findOneByOrFail: jest.fn().mockResolvedValue({
        id: 'person-2', name: 'Pessoa Boleto', taxId: '52998224725', email: 'boleto@example.com',
      }),
    });
    const opportunities = repository({ findOneByOrFail: jest.fn().mockResolvedValue(opportunity) });
    const contracts = repository({ findOneByOrFail: jest.fn().mockResolvedValue(contract) });
    const billingCustomers = repository({
      findOne: jest.fn().mockResolvedValue({ id: 'billing-customer-2', externalId: 'cus_2' }),
    });
    const checkoutSessions = repository({
      save: jest.fn().mockImplementation(async (value) => ({ id: value.id || 'checkout-local-2', ...value })),
    });
    const asaas = {
      createCheckout: jest.fn(),
      createSubscription: jest.fn().mockResolvedValue({ id: 'sub_asaas_1' }),
      subscriptionPayments: jest.fn().mockResolvedValue({
        data: [{ id: 'pay_1', invoiceUrl: 'https://asaas.example/invoice/1', bankSlipUrl: 'https://asaas.example/boleto/1' }],
      }),
    };
    const { service } = createService({ opportunities, people, contracts, billingCustomers, checkoutSessions, asaas });
    jest.spyOn(service as any, 'byToken').mockResolvedValue(session);
    jest.spyOn(service as any, 'audit').mockResolvedValue(undefined);

    const result = await service.startAsaasCheckout('token', { billingType: BillingType.BOLETO });

    expect(result.checkoutLink).toBe('https://asaas.example/invoice/1');
    expect(asaas.createSubscription).toHaveBeenCalledWith('unit-1', expect.objectContaining({
      billingType: BillingType.BOLETO,
      externalReference: 'opportunity-2',
    }));
    expect(asaas.createCheckout).not.toHaveBeenCalled();
  });


  it('recusa aprovação quando as condições mudaram após a solicitação', async () => {
    const approvals = repository({
      findOne: jest.fn().mockResolvedValue({
        id: 'approval-stale',
        opportunityId: 'opportunity-1',
        status: ApprovalStatus.PENDING,
        requestedConditions: { pricing: { finalAmount: 798 } },
      }),
    });
    const opportunities = repository({
      findOneByOrFail: jest.fn().mockResolvedValue({
        id: 'opportunity-1',
        negotiationSnapshot: { pricing: { finalAmount: 850 } },
      }),
    });
    const { service } = createService({ approvals, opportunities });

    await expect(service.decide(
      'unit-1',
      'approval-stale',
      'manager-1',
      { decision: 'APPROVED', notes: 'Aprovado' },
    )).rejects.toBeInstanceOf(ConflictException);
    expect(approvals.save).not.toHaveBeenCalled();
  });

  it('reconhece aprovação já concedida para o snapshot atual', async () => {
    const snapshot = {
      pricing: { finalAmount: 798 },
      discounts: [{ type: 'PERCENTAGE', value: 5 }],
    };
    const opportunity = {
      id: 'opportunity-approved',
      unitId: 'unit-1',
      ownerUserId: 'user-1',
      negotiationSnapshot: snapshot,
    };
    const opportunities = repository({ findOne: jest.fn().mockResolvedValue(opportunity) });
    const policies = repository({
      find: jest.fn().mockResolvedValue([{
        targetUserId: 'user-1',
        targetRole: null,
        maxDiscountPercent: '0',
        maxDiscountAmount: null,
        minUnitPrice: null,
        allowedBillingTypes: [],
        active: true,
      }]),
    });
    const approvals = repository({
      find: jest.fn().mockResolvedValue([{
        id: 'approval-1',
        status: ApprovalStatus.APPROVED,
        requestedConditions: snapshot,
        reason: 'Condição aprovada',
        decidedAt: new Date(),
      }]),
    });
    const { service } = createService({ opportunities, policies, approvals });
    jest.spyOn(service as any, 'assertOpportunityAccess').mockResolvedValue(undefined);

    const result = await service.evaluateOpportunity(
      'unit-1',
      'opportunity-approved',
      'user-1',
      UnitRole.SALES,
      GlobalRole.STANDARD,
    );

    expect(result.allowed).toBe(true);
    expect(result.policyAllowed).toBe(false);
    expect(result.approvalRequired).toBe(false);
    expect(result.approval?.id).toBe('approval-1');
  });

});
