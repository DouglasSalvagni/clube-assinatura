import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  ApprovalStatus,
  BillingCycle,
  BillingType,
  CommercialStatus,
  ContractRelationType,
  ContractStatus,
  CustomerType,
  GlobalRole,
  PrecheckoutStatus,
  SubscriptionStatus,
  OpportunityStatus,
  FinancialStatus,
  AccessStatus,
  UnitRole,
} from '../../database/entities';
import { CommercialWorkflowService } from './commercial-workflow.service';
import { PricingService } from './pricing.service';

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
  teamMembers?: any;
  teams?: any;
  billingCustomers?: any;
  checkoutSessions?: any;
  subscriptions?: any;
  subscriptionMembers?: any;
  sales?: any;
  billing?: any;
  lifecycle?: any;
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
  const teamMembers = options.teamMembers || repository({ find: jest.fn().mockResolvedValue([]), exists: jest.fn().mockResolvedValue(false) });
  const teams = options.teams || repository({ exists: jest.fn().mockResolvedValue(false) });
  const billingCustomers = options.billingCustomers || repository();
  const checkoutSessions = options.checkoutSessions || repository();
  const subscriptions = options.subscriptions || repository();
  const subscriptionMembers = options.subscriptionMembers || repository({ find: jest.fn().mockResolvedValue([]) });
  const sales = options.sales || repository();
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
    teamMembers,
    teams,
    repository(), // memberships
    repository(), // offer versions
    repository(), // template versions
    repository(), // templates
    repository(), // audit logs
    billingCustomers,
    checkoutSessions,
    subscriptions,
    subscriptionMembers,
    sales,
    options.pricing || { calculate: jest.fn() } as any,
    options.asaas || {
      createCustomer: jest.fn(),
      updateCustomer: jest.fn(),
      createCheckout: jest.fn(),
      createSubscription: jest.fn(),
      subscriptionPayments: jest.fn(),
    } as any,
    options.billing || { connectionEntity: jest.fn().mockResolvedValue({ id: 'billing-1' }) } as any,
    options.lifecycle || { record: jest.fn().mockResolvedValue(undefined) } as any,
    options.feature || { assertEnabled: jest.fn() },
  );
  return {
    service, policies, approvals, opportunities, people, participants, opportunityMembers, teamMembers, teams, sessions, contracts,
    billingCustomers, checkoutSessions, subscriptions, subscriptionMembers, sales,
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

  it('does not treat the active current subscription as confirmed payment for an amendment', async () => {
    const session: any = {
      id: 'revision-session', unitId: 'unit-1', opportunityId: 'opp-1', contractId: 'revision-1',
      checkoutSessionId: null, tokenHash: 'hash', status: PrecheckoutStatus.ACCEPTED,
      revokedAt: null, expiresAt: new Date(Date.now() + 60_000), pricingSnapshot: {}, customerData: {},
    };
    const contract: any = {
      id: 'revision-1', unitId: 'unit-1', parentContractId: 'original-1', relationType: ContractRelationType.AMENDMENT,
      status: ContractStatus.ACCEPTED, requiresPayment: true, snapshot: { negotiation: { cycle: 'YEARLY' } },
    };
    const opportunities = repository({
      findOneByOrFail: jest.fn().mockResolvedValue({
        id: 'opp-1', unitId: 'unit-1', primaryPersonId: 'person-1', customerType: CustomerType.PERSON,
        billingType: BillingType.CREDIT_CARD, negotiationSnapshot: {},
      }),
    });
    const sessions = repository({ findOne: jest.fn().mockResolvedValue(session) });
    const contracts = repository({ findOne: jest.fn().mockResolvedValue(contract) });
    const participants = repository({ find: jest.fn().mockResolvedValue([]) });
    const subscriptions = repository({
      findOne: jest.fn().mockResolvedValue({ status: SubscriptionStatus.ACTIVE, externalSubscriptionId: 'asaas-old' }),
    });
    const { service } = createService({ opportunities, sessions, contracts, participants, subscriptions });
    jest.spyOn(service as any, 'hash').mockReturnValue('hash');

    const result = await service.publicGet('revision-token');

    expect(result.payment.confirmed).toBe(false);
    expect(result.payment.awaitingConfirmation).toBe(false);
    expect(result.currentSubscription).toEqual({ status: SubscriptionStatus.ACTIVE });
  });

  it('não exige aprovação de PJ quando a negociação está dentro da política', async () => {
    const opportunity = {
      id: 'opportunity-1',
      unitId: 'unit-1',
      customerType: CustomerType.COMPANY,
      commercialStatus: CommercialStatus.NEGOTIATION,
      ownerUserId: 'user-1',
      teamId: null,
      negotiationSnapshot: {
        customerType: CustomerType.COMPANY,
        cycle: 'MONTHLY',
        billingType: BillingType.CREDIT_CARD,
        discounts: [],
        pricing: { commercialDiscountAmount: 0, unitPrice: 40, finalAmount: 400 },
        participants: { contractedLives: 10 },
      },
    };
    const opportunities = repository({
      findOne: jest.fn().mockResolvedValue(opportunity),
    });
    const { service } = createService({ opportunities });
    jest.spyOn(service as any, 'assertOpportunityAccess').mockResolvedValue(undefined);

    const result = await service.evaluateOpportunity(
      'unit-1',
      'opportunity-1',
      'user-1',
      UnitRole.SALES,
      GlobalRole.STANDARD,
    );

    expect(result.allowed).toBe(true);
    expect(result.approvalRequired).toBe(false);
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
    jest.spyOn(service as any, 'resolveTemplate').mockResolvedValue({
      id: 'template-version-1',
      templateId: 'template-1',
      status: 'PUBLISHED',
      content: 'Contrato',
      version: 1,
    });

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


  it('preserva a quantidade declarada na oferta pública ao criar o pré-checkout', async () => {
    const opportunity = {
      id: 'opportunity-public',
      unitId: 'unit-1',
      primaryPersonId: 'holder-1',
      customerType: CustomerType.PERSON,
      ownerUserId: null,
      teamId: null,
      billingCycle: 'MONTHLY',
      billingType: BillingType.CREDIT_CARD,
      expectedValue: '150.00',
      negotiationSnapshot: {
        customerType: CustomerType.PERSON,
        cycle: 'MONTHLY',
        billingType: BillingType.CREDIT_CARD,
        source: 'PUBLIC_OFFER',
        participants: { dependentCount: 2 },
        pricing: { holderAmount: 100, dependentAmount: 25, finalAmount: 150 },
        discounts: [],
      },
    };
    const opportunities = repository({
      findOne: jest.fn().mockResolvedValue(opportunity),
    });
    const sessions = repository({
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation(async value => ({ id: 'session-public', ...value })),
    });
    const pricing = { calculate: jest.fn() };
    const { service } = createService({ opportunities, sessions, pricing });
    jest.spyOn(service as any, 'audit').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'resolveTemplate').mockResolvedValue({
      id: 'template-version-1',
      templateId: 'template-1',
      status: 'PUBLISHED',
      content: 'Contrato',
      version: 1,
    });

    await service.createPrecheckout('unit-1', 'opportunity-public');

    expect(pricing.calculate).not.toHaveBeenCalled();
    expect(sessions.save).toHaveBeenCalledWith(expect.objectContaining({
      pricingSnapshot: expect.objectContaining({
        source: 'PUBLIC_OFFER',
        participants: { dependentCount: 2 },
        pricing: expect.objectContaining({ finalAmount: 150 }),
      }),
    }));
  });

  it('bloqueia novo pré-checkout inicial quando a oportunidade já possui assinatura', async () => {
    const opportunity = {
      id: 'opportunity-converted',
      unitId: 'unit-1',
      customerType: CustomerType.PERSON,
      commercialStatus: CommercialStatus.CONVERTED,
    };
    const opportunities = repository({ findOne: jest.fn().mockResolvedValue(opportunity) });
    const subscriptions = repository({
      findOne: jest.fn().mockResolvedValue({ id: 'subscription-1', sourceOpportunityId: opportunity.id }),
    });
    const sessions = repository();
    const { service } = createService({ opportunities, subscriptions, sessions });

    await expect(service.createPrecheckout('unit-1', opportunity.id))
      .rejects.toThrow('Esta oportunidade já foi convertida em assinatura');
    expect(sessions.save).not.toHaveBeenCalled();
  });

  it('permite cadastrar os dados dos dependentes sem alterar a negociação interna', async () => {
    const session = {
      id: 'session-internal',
      unitId: 'unit-1',
      opportunityId: 'opportunity-1',
      tokenHash: 'hash',
      status: PrecheckoutStatus.CREATED,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      pricingSnapshot: {
        source: 'DEFAULT_PRICE_TABLE',
        participants: { dependentCount: 3 },
      },
    };
    const sessions = repository({
      findOne: jest.fn().mockResolvedValue(session),
    });
    const opportunities = repository({
      findOneByOrFail: jest.fn().mockResolvedValue({
        id: 'opportunity-1',
        unitId: 'unit-1',
        customerType: CustomerType.PERSON,
      }),
    });
    const participants = repository({
      count: jest.fn().mockResolvedValue(0),
      save: jest.fn().mockImplementation(async value => ({ id: 'participant-1', ...value })),
    });
    const pricing = { calculate: jest.fn() };
    const { service } = createService({ sessions, opportunities, participants, pricing });
    jest.spyOn(service as any, 'hash').mockReturnValue('hash');
    jest.spyOn(service, 'publicGet').mockResolvedValue({} as any);

    await service.addParticipant('token', {
      name: 'Dependente',
      taxId: '11144477735',
    });

    expect(participants.save).toHaveBeenCalled();
    expect(pricing.calculate).not.toHaveBeenCalled();
  });

  it('usa a negociação como fonte de verdade mesmo que a oportunidade tenha outra quantidade de dependentes', async () => {
    const opportunity = {
      id: 'opportunity-1',
      unitId: 'unit-1',
      primaryPersonId: 'holder-1',
      customerType: CustomerType.PERSON,
      commercialStatus: CommercialStatus.NEGOTIATION,
      ownerUserId: 'user-1',
      billingCycle: 'MONTHLY',
      billingType: BillingType.CREDIT_CARD,
      expectedValue: '175.00',
      negotiationSnapshot: {
        customerType: CustomerType.PERSON,
        cycle: 'MONTHLY',
        billingType: BillingType.CREDIT_CARD,
        allowedBillingTypes: [BillingType.CREDIT_CARD],
        participants: { dependentCount: 3 },
        pricing: { holderAmount: 100, dependentAmount: 25, finalAmount: 175 },
        discounts: [],
      },
    };
    const opportunities = repository({ findOne: jest.fn().mockResolvedValue(opportunity) });
    const opportunityMembers = repository({
      find: jest.fn().mockResolvedValue([]),
    });
    const people = repository({
      findOneByOrFail: jest.fn().mockResolvedValue({
        id: 'holder-1', name: 'Titular', taxId: '52998224725', email: 'titular@example.com',
        phone: '51999999999', whatsapp: null, postalCode: '90000000', address: 'Rua A',
        addressNumber: '100', complement: null, district: 'Centro', city: 'Porto Alegre', state: 'RS',
      }),
      find: jest.fn().mockResolvedValue([]),
    });
    const sessions = repository({
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation(async value => ({ id: 'session-new', ...value })),
    });
    const pricing = { calculate: jest.fn() };
    const { service } = createService({ opportunities, people, opportunityMembers, sessions, pricing });
    jest.spyOn(service as any, 'assertOpportunityAccess').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'audit').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'resolveTemplate').mockResolvedValue({
      id: 'template-version-1',
      templateId: 'template-1',
      status: 'PUBLISHED',
      content: 'Contrato',
      version: 1,
    });

    const result = await service.createPrecheckout(
      'unit-1',
      'opportunity-1',
      7,
      'user-1',
      UnitRole.SALES,
      GlobalRole.STANDARD,
    );

    expect(result.url).toMatch(/^\/checkout\//);
    expect(pricing.calculate).not.toHaveBeenCalled();
    expect(sessions.save).toHaveBeenCalledWith(expect.objectContaining({
      pricingSnapshot: expect.objectContaining({
        participants: { dependentCount: 3 },
        pricing: expect.objectContaining({ finalAmount: 175 }),
      }),
    }));
    expect(opportunity.expectedValue).toBe('175.00');
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

  it('requires a new checkout for a billing cycle change and renders readable amendment terms', async () => {
    const parent: any = {
      id: 'parent-technical-id', unitId: 'unit-1', opportunityId: 'opp-cycle', version: 1,
      status: ContractStatus.ACCEPTED, templateCode: 'PF', templateVersionId: null, contentHash: 'a'.repeat(64),
      snapshot: {
        customer: {}, participants: [],
        negotiation: {
          customerType: CustomerType.PERSON, cycle: BillingCycle.MONTHLY, billingType: BillingType.CREDIT_CARD,
          allowedBillingTypes: [BillingType.CREDIT_CARD], participants: { dependentCount: 1 },
          pricing: { holderAmount: 100, dependentAmount: 25, finalAmount: 125 }, discounts: [],
        },
      },
    };
    const opportunity: any = {
      id: 'opp-cycle', unitId: 'unit-1', customerType: CustomerType.PERSON, ownerUserId: 'admin-1',
      billingCycle: BillingCycle.MONTHLY, billingType: BillingType.CREDIT_CARD, expectedValue: '125.00',
      negotiationSnapshot: parent.snapshot.negotiation,
    };
    const contracts = repository({
      findOne: jest.fn().mockResolvedValue(parent), find: jest.fn().mockResolvedValue([]),
      save: jest.fn(async (value) => ({ id: 'revision-yearly', ...value })),
    });
    const sessions = repository({
      find: jest.fn().mockResolvedValue([]), save: jest.fn(async (value) => ({ id: 'session-yearly', ...value })),
    });
    const opportunities = repository({ findOne: jest.fn().mockResolvedValue(opportunity) });
    const { service } = createService({
      opportunities,
      contracts, sessions, pricing: new PricingService(),
    });
    jest.spyOn(service as any, 'assertOpportunityAccess').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'audit').mockResolvedValue(undefined);

    const result = await service.createContractRevision('unit-1', parent.id, {
      relationType: ContractRelationType.AMENDMENT,
      reason: 'Migracao para plano anual',
      changes: { cycle: BillingCycle.YEARLY, effectiveAt: '2026-09-01' },
      requiresPayment: false,
    }, 'admin-1', UnitRole.ADMIN, GlobalRole.STANDARD);

    expect(result.contract.requiresPayment).toBe(true);
    expect(result.contract.renderedContent).toContain('Periodicidade: Anual');
    expect(result.contract.renderedContent).toContain('Dependentes contratados: 1');
    expect(result.contract.renderedContent).toContain('Valor total anual:');
    expect(result.contract.renderedContent).not.toContain(parent.id);
    expect(result.contract.renderedContent).not.toContain(parent.contentHash);
    expect(result.contract.renderedContent).not.toContain('"cycle"');
  });

  it('saves a post-sale draft repeatedly without changing the original contract and promotes its latest snapshot', async () => {
    const parent: any = {
      id: 'contract-original', unitId: 'unit-1', opportunityId: 'opp-post-sale', version: 1,
      status: ContractStatus.ACCEPTED, templateCode: 'PF', templateVersionId: null, contentHash: 'a'.repeat(64),
      snapshot: { customer: {}, participants: [], negotiation: {
        customerType: CustomerType.PERSON, cycle: BillingCycle.MONTHLY, billingType: BillingType.CREDIT_CARD,
        allowedBillingTypes: [BillingType.CREDIT_CARD], participants: { dependentCount: 1 },
        pricing: { holderAmount: 100, dependentAmount: 20, finalAmount: 120 }, discounts: [],
      } },
    };
    const originalSnapshot = JSON.stringify(parent.snapshot);
    const opportunity: any = {
      id: 'opp-post-sale', unitId: 'unit-1', customerType: CustomerType.PERSON, ownerUserId: 'admin-1', teamId: null,
      status: OpportunityStatus.WON, commercialStatus: CommercialStatus.CONVERTED,
      billingCycle: BillingCycle.MONTHLY, billingType: BillingType.CREDIT_CARD, expectedValue: '120.00',
      negotiationSnapshot: parent.snapshot.negotiation,
    };
    const stored: any[] = [parent];
    const contracts = repository({
      findOne: jest.fn().mockResolvedValue(parent),
      find: jest.fn().mockImplementation(async () => stored),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => {
        if (!value.id) value.id = 'draft-post-sale';
        const index = stored.findIndex((item) => item.id === value.id);
        if (index >= 0) stored[index] = value;
        else stored.push(value);
        return value;
      }),
    });
    const sessions = repository({ find: jest.fn().mockResolvedValue([]), save: jest.fn(async value => ({ id: 'session-draft', ...value })) });
    const opportunities = repository({ findOne: jest.fn().mockResolvedValue(opportunity) });
    const { service } = createService({
      opportunities,
      contracts, sessions, pricing: new PricingService(),
    });
    jest.spyOn(service as any, 'assertOpportunityAccess').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'audit').mockResolvedValue(undefined);

    const first = await service.saveContractRevisionDraft('unit-1', opportunity.id, {
      relationType: ContractRelationType.AMENDMENT, reason: 'Revisão mensal', requiresPayment: false,
      changes: { holderAmount: 130, dependentAmount: 20, dependentCount: 1, allowedBillingTypes: [BillingType.CREDIT_CARD] },
    }, 'admin-1', UnitRole.ADMIN, GlobalRole.STANDARD);
    const second = await service.saveContractRevisionDraft('unit-1', opportunity.id, {
      relationType: ContractRelationType.AMENDMENT, reason: 'Revisão mensal final', requiresPayment: false,
      changes: { holderAmount: 150, dependentAmount: 20, dependentCount: 1, allowedBillingTypes: [BillingType.CREDIT_CARD] },
    }, 'admin-1', UnitRole.ADMIN, GlobalRole.STANDARD);

    expect(first.draft.id).toBe(second.draft.id);
    expect(second.draft.status).toBe(ContractStatus.DRAFT);
    expect(second.draft.snapshot.negotiation.pricing.finalAmount).toBe(170);
    expect(JSON.stringify(parent.snapshot)).toBe(originalSnapshot);
    expect(opportunity.negotiationSnapshot).toBe(parent.snapshot.negotiation);
    expect(opportunities.save).not.toHaveBeenCalled();

    const result = await service.createContractRevisionFromDraft(
      'unit-1', parent.id, 'admin-1', UnitRole.ADMIN, GlobalRole.STANDARD,
    );
    expect(result.contract.status).toBe(ContractStatus.READY);
    expect(result.contract.requiresPayment).toBe(false);
    expect(result.contract.changeReason).toBe('Revisão mensal final');
    expect(result.contract.snapshot.negotiation.pricing.finalAmount).toBe(170);
    expect(result.contract.parentContractId).toBe(parent.id);
    expect(parent.status).toBe(ContractStatus.ACCEPTED);
  });

  it('preserves the draft when a previous revision is awaiting payment and lets the operator reissue or revoke it', async () => {
    const parent: any = {
      id: 'contract-original', unitId: 'unit-1', opportunityId: 'opp-pending-revision', version: 1,
      status: ContractStatus.ACCEPTED, contentHash: 'a'.repeat(64), templateCode: 'PF', templateVersionId: null,
      snapshot: { customer: {}, participants: [], negotiation: { customerType: CustomerType.PERSON, cycle: BillingCycle.MONTHLY } },
    };
    const draft: any = {
      id: 'draft-new', unitId: 'unit-1', opportunityId: parent.opportunityId, parentContractId: parent.id, version: 0,
      relationType: ContractRelationType.AMENDMENT, status: ContractStatus.DRAFT, requiresPayment: true,
      changeReason: 'Novo plano anual', snapshot: { negotiation: { cycle: BillingCycle.YEARLY }, revision: { reason: 'Novo plano anual' } },
    };
    const pendingContract: any = {
      id: 'revision-pending', unitId: 'unit-1', opportunityId: parent.opportunityId, parentContractId: parent.id, version: 2,
      relationType: ContractRelationType.AMENDMENT, status: ContractStatus.ACCEPTED, requiresPayment: true,
    };
    const pendingSession: any = {
      id: 'pending-session', unitId: 'unit-1', opportunityId: parent.opportunityId, contractId: pendingContract.id,
      checkoutSessionId: 'pending-checkout', status: PrecheckoutStatus.PAYMENT_PENDING, tokenHash: 'old-hash',
      expiresAt: new Date(Date.now() + 60_000), revokedAt: null, createdAt: new Date(),
    };
    const checkout: any = {
      id: 'pending-checkout', unitId: 'unit-1', externalId: 'checkout-asaas-1', status: 'PENDING', url: 'https://asaas.test/checkout',
      payload: { providerResourceType: 'CHECKOUT' }, expiresAt: new Date(Date.now() + 60_000),
    };
    const allContracts = [parent, draft, pendingContract];
    const contracts = repository({
      findOne: jest.fn().mockResolvedValue(parent),
      find: jest.fn().mockResolvedValue(allContracts),
      save: jest.fn(async value => value),
    });
    const sessions = repository({
      find: jest.fn().mockResolvedValue([pendingSession]),
      save: jest.fn(async value => value),
    });
    const opportunities = repository({ findOne: jest.fn().mockResolvedValue({
      id: parent.opportunityId, unitId: 'unit-1', ownerUserId: 'admin-1', teamId: null,
      customerType: CustomerType.PERSON, status: OpportunityStatus.WON, commercialStatus: CommercialStatus.CONVERTED,
    }) });
    const checkoutSessions = repository({ findOne: jest.fn().mockResolvedValue(checkout), save: jest.fn(async value => value) });
    const asaas = { cancelCheckout: jest.fn().mockResolvedValue({}), deletePayment: jest.fn(), deleteSubscription: jest.fn() };
    const { service } = createService({ opportunities, contracts, sessions, checkoutSessions, asaas, pricing: new PricingService() });
    jest.spyOn(service as any, 'assertOpportunityAccess').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'audit').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'hash').mockReturnValue('new-hash');

    await expect(service.createContractRevisionFromDraft(
      'unit-1', parent.id, 'admin-1', UnitRole.ADMIN, GlobalRole.STANDARD,
    )).rejects.toThrow('Reenvie ou anule o link pendente');
    expect(draft.status).toBe(ContractStatus.DRAFT);
    expect(contracts.save).not.toHaveBeenCalled();

    const reissued = await service.reissueContractRevisionPrecheckout(
      'unit-1', parent.opportunityId, 'admin-1', UnitRole.ADMIN, GlobalRole.STANDARD,
    );
    expect(reissued.precheckout.url).toMatch(/^\/checkout\//);
    expect(pendingSession.tokenHash).toBe('new-hash');
    expect(pendingSession.status).toBe(PrecheckoutStatus.PAYMENT_PENDING);

    const revoked = await service.revokeContractRevisionPrecheckout(
      'unit-1', parent.opportunityId, 'admin-1', UnitRole.ADMIN, GlobalRole.STANDARD,
    );
    expect(revoked.revoked).toBe(true);
    expect(asaas.cancelCheckout).toHaveBeenCalledWith('unit-1', 'checkout-asaas-1');
    expect(pendingSession.status).toBe(PrecheckoutStatus.REVOKED);
    expect(pendingContract.status).toBe(ContractStatus.VOID);
    expect(parent.status).toBe(ContractStatus.ACCEPTED);
  });

  it('PF anual só permite aumentar dependentes por renovação contratual', async () => {
    const parent = {
      id: 'contract-annual', unitId: 'unit-1', opportunityId: 'opportunity-annual', version: 1,
      status: ContractStatus.ACCEPTED, contentHash: 'a'.repeat(64),
      snapshot: {
        negotiation: {
          customerType: CustomerType.PERSON, cycle: 'YEARLY', billingType: BillingType.CREDIT_CARD,
          allowedBillingTypes: [BillingType.CREDIT_CARD], participants: { dependentCount: 1 },
          pricing: { holderAmount: 1000, dependentAmount: 200, finalAmount: 1200 }, discounts: [],
        },
      },
    };
    const opportunity = {
      id: 'opportunity-annual', unitId: 'unit-1', customerType: CustomerType.PERSON,
      ownerUserId: 'admin-1', billingCycle: 'YEARLY', billingType: BillingType.CREDIT_CARD,
      negotiationSnapshot: parent.snapshot.negotiation,
    };
    const opportunities = repository({ findOne: jest.fn().mockResolvedValue(opportunity) });
    const contracts = repository({
      findOne: jest.fn().mockResolvedValue(parent),
      find: jest.fn().mockResolvedValue([]),
    });
    const { service } = createService({ opportunities, contracts });
    jest.spyOn(service as any, 'assertOpportunityAccess').mockResolvedValue(undefined);

    await expect(service.createContractRevision(
      'unit-1',
      'contract-annual',
      {
        relationType: ContractRelationType.AMENDMENT,
        reason: 'Inclusão de novo dependente',
        changes: { dependentCount: 2 },
        requiresPayment: false,
      },
      'admin-1',
      UnitRole.ADMIN,
      GlobalRole.STANDARD,
    )).rejects.toThrow('novos dependentes somente podem ser incluídos por renovação contratual');
  });

  it('PJ não permite reduzir vidas contratadas abaixo dos beneficiários ativos', async () => {
    const parent = {
      id: 'contract-company', unitId: 'unit-1', opportunityId: 'opportunity-company', version: 1,
      status: ContractStatus.ACCEPTED, contentHash: 'b'.repeat(64),
      snapshot: {
        negotiation: {
          customerType: CustomerType.COMPANY, cycle: 'MONTHLY', billingType: BillingType.BOLETO,
          allowedBillingTypes: [BillingType.BOLETO], participants: { contractedLives: 10 },
          pricing: { unitPrice: 30, finalAmount: 300 }, discounts: [],
        },
      },
    };
    const opportunity = {
      id: 'opportunity-company', unitId: 'unit-1', customerType: CustomerType.COMPANY,
      ownerUserId: 'admin-1', billingCycle: 'MONTHLY', billingType: BillingType.BOLETO,
      negotiationSnapshot: parent.snapshot.negotiation,
    };
    const opportunities = repository({ findOne: jest.fn().mockResolvedValue(opportunity) });
    const contracts = repository({
      findOne: jest.fn().mockResolvedValue(parent),
      find: jest.fn().mockResolvedValue([]),
    });
    const subscriptions = repository({
      findOne: jest.fn().mockResolvedValue({ id: 'subscription-company' }),
    });
    const subscriptionMembers = repository({ count: jest.fn().mockResolvedValue(8) });
    const { service } = createService({ opportunities, contracts, subscriptions, subscriptionMembers });
    jest.spyOn(service as any, 'assertOpportunityAccess').mockResolvedValue(undefined);

    await expect(service.createContractRevision(
      'unit-1',
      'contract-company',
      {
        relationType: ContractRelationType.AMENDMENT,
        reason: 'Redução das vidas contratadas',
        changes: { lives: 7 },
        requiresPayment: false,
      },
      'admin-1',
      UnitRole.ADMIN,
      GlobalRole.STANDARD,
    )).rejects.toThrow('não pode ser menor que os 8 beneficiários atualmente cadastrados');
  });

  it('impede gerar o contrato enquanto o endereço obrigatório não foi persistido', async () => {
    const session = {
      id: 'precheckout-incomplete',
      unitId: 'unit-1',
      opportunityId: 'opportunity-1',
      status: PrecheckoutStatus.DATA_COMPLETED,
      customerData: {
        name: 'Pessoa Teste',
        taxId: '52998224725',
        email: 'teste@example.com',
        phone: '51999999999',
      },
    };
    const opportunities = repository({
      findOneByOrFail: jest.fn().mockResolvedValue({
        id: 'opportunity-1',
        unitId: 'unit-1',
        customerType: CustomerType.PERSON,
      }),
    });
    const { service } = createService({ opportunities });
    jest.spyOn(service as any, 'byToken').mockResolvedValue(session);

    await expect(service.prepareContract('token')).rejects.toThrow(
      'Complete os dados cadastrais antes de continuar: CEP, Endereço, Número, Bairro, Cidade, UF.',
    );
  });

  it('sincroniza o cliente e usa o valor congelado no contrato aceito no Checkout hospedado', async () => {
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
    const contract = {
      id: 'contract-1',
      unitId: 'unit-1',
      status: ContractStatus.ACCEPTED,
      relationType: ContractRelationType.ORIGINAL,
      requiresPayment: true,
      snapshot: {
        negotiation: {
          cycle: 'MONTHLY',
          allowedBillingTypes: [BillingType.CREDIT_CARD],
          pricing: { finalAmount: 135 },
        },
      },
    };
    const opportunity = {
      id: 'opportunity-1', unitId: 'unit-1', primaryPersonId: 'person-1', customerType: CustomerType.PERSON,
      billingCycle: 'MONTHLY', billingType: BillingType.CREDIT_CARD,
      negotiationSnapshot: {}, status: 'OPEN', commercialStatus: CommercialStatus.APPROVED,
    };
    const person = {
      id: 'person-1', name: 'Pessoa Teste', taxId: '52998224725', email: 'teste@example.com',
      phone: '51999999999', postalCode: '90010000', address: 'Rua A', addressNumber: '10',
      complement: null, district: 'Centro', city: 'Porto Alegre', state: 'RS',
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
    const subscriptions = repository({
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation(async (value) => ({ id: 'subscription-pending-1', ...value })),
    });
    const asaas = {
      updateCustomer: jest.fn().mockResolvedValue({ id: 'cus_1' }),
      createCheckout: jest.fn().mockResolvedValue({ id: 'checkout_asaas_1', link: 'https://asaas.example/checkout' }),
    };
    const { service } = createService({ opportunities, people, contracts, billingCustomers, checkoutSessions, subscriptions, asaas });
    jest.spyOn(service as any, 'byToken').mockResolvedValue(session);
    jest.spyOn(service as any, 'audit').mockResolvedValue(undefined);

    const result = await service.startAsaasCheckout('token', { billingType: BillingType.CREDIT_CARD });

    expect(result.checkoutLink).toBe('https://asaas.example/checkout');
    expect(asaas.createCheckout).toHaveBeenCalledWith('unit-1', expect.objectContaining({
      billingTypes: [BillingType.CREDIT_CARD],
      customer: 'cus_1',
      items: [expect.objectContaining({ value: 135 })],
      callback: expect.objectContaining({ expiredUrl: expect.any(String) }),
    }));
    expect(asaas.updateCustomer).toHaveBeenCalledWith('unit-1', 'cus_1', expect.objectContaining({
      cpfCnpj: '52998224725',
      address: 'Rua A',
      addressNumber: '10',
      postalCode: '90010000',
      province: 'Centro',
    }));
    expect(asaas.createCheckout.mock.calls[0][1]).not.toHaveProperty('customerData');
    expect(subscriptions.save).toHaveBeenCalledWith(expect.objectContaining({
      status: SubscriptionStatus.PENDING_PAYMENT,
      sourceOpportunityId: 'opportunity-1',
      metadata: expect.objectContaining({
        contractId: 'contract-1',
        contractedAmount: 135,
      }),
    }));
    expect(opportunity.commercialStatus).toBe(CommercialStatus.CONVERTED);
  });

  it('creates a new hosted checkout for an accepted paid amendment while the current subscription remains active', async () => {
    const session: any = {
      id: 'revision-session', unitId: 'unit-1', opportunityId: 'opp-revision', contractId: 'revision-contract',
      checkoutSessionId: null, status: PrecheckoutStatus.ACCEPTED, customerData: {}, pricingSnapshot: {},
    };
    const contract: any = {
      id: 'revision-contract', unitId: 'unit-1', status: ContractStatus.ACCEPTED,
      relationType: ContractRelationType.AMENDMENT, parentContractId: 'original-contract', requiresPayment: true,
      snapshot: { negotiation: {
        cycle: BillingCycle.YEARLY, allowedBillingTypes: [BillingType.CREDIT_CARD],
        pricing: { finalAmount: 1200 },
      } },
    };
    const opportunity: any = {
      id: 'opp-revision', unitId: 'unit-1', primaryPersonId: 'person-1', customerType: CustomerType.PERSON,
      billingCycle: BillingCycle.MONTHLY, billingType: BillingType.CREDIT_CARD,
      negotiationSnapshot: {}, status: OpportunityStatus.WON, commercialStatus: CommercialStatus.CONVERTED,
    };
    const person: any = {
      id: 'person-1', name: 'Cliente', taxId: '52998224725', email: 'cliente@example.com', phone: '51999999999',
      postalCode: '90010000', address: 'Rua A', addressNumber: '10', complement: null, district: 'Centro', city: 'Porto Alegre', state: 'RS',
    };
    const subscriptions = repository({
      findOne: jest.fn().mockResolvedValue({ id: 'sub-current', status: SubscriptionStatus.ACTIVE, externalSubscriptionId: 'asaas-old' }),
    });
    const asaas = {
      updateCustomer: jest.fn().mockResolvedValue({ id: 'cus-1' }),
      createCheckout: jest.fn().mockResolvedValue({ id: 'checkout-new', link: 'https://asaas.example/new-checkout' }),
    };
    const { service, checkoutSessions } = createService({
      opportunities: repository({ findOneByOrFail: jest.fn().mockResolvedValue(opportunity), save: jest.fn(async value => value) }),
      people: repository({ findOneByOrFail: jest.fn().mockResolvedValue(person) }),
      contracts: repository({ findOneByOrFail: jest.fn().mockResolvedValue(contract) }),
      billingCustomers: repository({ findOne: jest.fn().mockResolvedValue({ id: 'billing-1', externalId: 'cus-1' }) }),
      checkoutSessions: repository({ save: jest.fn(async value => ({ id: 'checkout-local-new', ...value })) }),
      subscriptions,
      asaas,
    });
    jest.spyOn(service as any, 'byToken').mockResolvedValue(session);
    jest.spyOn(service as any, 'audit').mockResolvedValue(undefined);

    const result = await service.startAsaasCheckout('revision-token', { billingType: BillingType.CREDIT_CARD });

    expect(result.checkoutLink).toBe('https://asaas.example/new-checkout');
    expect(asaas.createCheckout).toHaveBeenCalledWith('unit-1', expect.objectContaining({
      items: [expect.objectContaining({ value: 1200 })],
      subscription: expect.objectContaining({ cycle: BillingCycle.YEARLY }),
    }));
    expect(checkoutSessions.save).toHaveBeenCalledWith(expect.objectContaining({
      opportunityId: 'opp-revision', payload: expect.objectContaining({ contractId: 'revision-contract' }),
    }));
    expect(session.status).toBe(PrecheckoutStatus.PAYMENT_PENDING);
    expect(subscriptions.save).not.toHaveBeenCalled();
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
        phone: '51999999999', postalCode: '90010000', address: 'Rua B', addressNumber: '20',
        complement: null, district: 'Centro', city: 'Porto Alegre', state: 'RS',
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
      updateCustomer: jest.fn().mockResolvedValue({ id: 'cus_2' }),
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


  it('gera Pix pela assinatura do Asaas em vez de Checkout recorrente hospedado', async () => {
    const session = {
      id: 'precheckout-pix',
      unitId: 'unit-1',
      opportunityId: 'opportunity-pix',
      contractId: 'contract-pix',
      checkoutSessionId: null,
      status: PrecheckoutStatus.ACCEPTED,
      customerData: {},
      pricingSnapshot: {
        cycle: 'YEARLY',
        allowedBillingTypes: [BillingType.CREDIT_CARD, BillingType.PIX],
        pricing: { finalAmount: 1200 },
      },
    };
    const contract = {
      id: 'contract-pix',
      unitId: 'unit-1',
      status: ContractStatus.ACCEPTED,
      requiresPayment: true,
      snapshot: {
        negotiation: {
          cycle: 'YEARLY',
          allowedBillingTypes: [BillingType.CREDIT_CARD, BillingType.PIX],
          pricing: { finalAmount: 1200 },
        },
      },
    };
    const opportunity = {
      id: 'opportunity-pix',
      unitId: 'unit-1',
      primaryPersonId: 'person-pix',
      customerType: CustomerType.PERSON,
      billingCycle: 'YEARLY',
      billingType: BillingType.PIX,
      negotiationSnapshot: {},
      status: 'OPEN',
      commercialStatus: CommercialStatus.APPROVED,
    };
    const people = repository({
      findOneByOrFail: jest.fn().mockResolvedValue({
        id: 'person-pix', name: 'Pessoa Pix', taxId: '52998224725', email: 'pix@example.com',
        phone: '51999999999', postalCode: '90010000', address: 'Rua Pix', addressNumber: '30',
        complement: null, district: 'Centro', city: 'Porto Alegre', state: 'RS',
      }),
    });
    const opportunities = repository({ findOneByOrFail: jest.fn().mockResolvedValue(opportunity) });
    const contracts = repository({ findOneByOrFail: jest.fn().mockResolvedValue(contract) });
    const billingCustomers = repository({
      findOne: jest.fn().mockResolvedValue({ id: 'billing-customer-pix', externalId: 'cus_pix' }),
    });
    const checkoutSessions = repository({
      save: jest.fn().mockImplementation(async (value) => ({ id: value.id || 'checkout-local-pix', ...value })),
    });
    const asaas = {
      updateCustomer: jest.fn().mockResolvedValue({ id: 'cus_pix' }),
      createCheckout: jest.fn(),
      createSubscription: jest.fn().mockResolvedValue({ id: 'sub_pix' }),
      subscriptionPayments: jest.fn().mockResolvedValue({
        data: [{ id: 'pay_pix', invoiceUrl: 'https://asaas.example/invoice/pix' }],
      }),
    };
    const { service } = createService({ opportunities, people, contracts, billingCustomers, checkoutSessions, asaas });
    jest.spyOn(service as any, 'byToken').mockResolvedValue(session);
    jest.spyOn(service as any, 'audit').mockResolvedValue(undefined);

    const result = await service.startAsaasCheckout('token', { billingType: BillingType.PIX });

    expect(result.checkoutLink).toBe('https://asaas.example/invoice/pix');
    expect(asaas.createSubscription).toHaveBeenCalledWith('unit-1', expect.objectContaining({
      customer: 'cus_pix',
      billingType: BillingType.PIX,
      value: 1200,
      cycle: 'YEARLY',
      externalReference: 'opportunity-pix',
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

describe('CommercialWorkflowService — escopo de oportunidade', () => {
  const opportunity = (overrides: Record<string, unknown> = {}) => ({
    id: 'opp-1',
    unitId: 'unit-1',
    ownerUserId: null,
    teamId: 'team-1',
    customerType: CustomerType.PERSON,
    negotiationSnapshot: {},
    ...overrides,
  });

  it('permite ao membro atuar em uma oportunidade da fila compartilhada do time', async () => {
    const opportunities = repository({ findOne: jest.fn().mockResolvedValue(opportunity()) });
    const teamMembers = repository({ exists: jest.fn().mockResolvedValue(true) });
    const teams = repository({ exists: jest.fn().mockResolvedValue(true) });
    const { service } = createService({ opportunities, teamMembers, teams });

    await expect(service.evaluateOpportunity(
      'unit-1', 'opp-1', 'seller-1', UnitRole.SALES, GlobalRole.STANDARD,
    )).resolves.toEqual(expect.objectContaining({ allowed: true }));
  });

  it('não permite que perfil de suporte atue na fila comercial mesmo sendo membro do time', async () => {
    const opportunities = repository({ findOne: jest.fn().mockResolvedValue(opportunity()) });
    const teamMembers = repository({ exists: jest.fn().mockResolvedValue(true) });
    const { service } = createService({ opportunities, teamMembers });

    await expect(service.evaluateOpportunity(
      'unit-1', 'opp-1', 'support-1', UnitRole.SUPPORT, GlobalRole.STANDARD,
    )).rejects.toBeInstanceOf(NotFoundException);
  });

  it('não permite ao membro atuar na oportunidade individual de um colega', async () => {
    const opportunities = repository({
      findOne: jest.fn().mockResolvedValue(opportunity({ ownerUserId: 'seller-a' })),
    });
    const teamMembers = repository({ exists: jest.fn().mockResolvedValue(true) });
    const { service } = createService({ opportunities, teamMembers });

    await expect(service.evaluateOpportunity(
      'unit-1', 'opp-1', 'seller-b', UnitRole.SALES, GlobalRole.STANDARD,
    )).rejects.toBeInstanceOf(NotFoundException);
  });

  it('diferencia time gerenciado de time em que o gerente é apenas membro', async () => {
    const opportunities = repository({
      findOne: jest.fn().mockResolvedValue(opportunity({ ownerUserId: 'seller-a' })),
    });
    const teams = repository({ exists: jest.fn().mockResolvedValue(false) });
    const teamMembers = repository({ exists: jest.fn().mockResolvedValue(true) });
    const { service } = createService({ opportunities, teams, teamMembers });

    await expect(service.evaluateOpportunity(
      'unit-1', 'opp-1', 'manager-1', UnitRole.MANAGER, GlobalRole.STANDARD,
    )).rejects.toBeInstanceOf(NotFoundException);

    teams.exists.mockResolvedValue(true);
    await expect(service.evaluateOpportunity(
      'unit-1', 'opp-1', 'manager-1', UnitRole.MANAGER, GlobalRole.STANDARD,
    )).resolves.toEqual(expect.objectContaining({ allowed: true }));
  });

  it('cria o assinante como PENDING_PAYMENT antes do primeiro pagamento e preserva o vínculo comercial', async () => {
    const opportunity: any = {
      id: 'opp-pending', unitId: 'unit-1', primaryPersonId: 'person-1', planPriceId: null,
      ownerUserId: 'seller-1', customerType: CustomerType.PERSON,
      status: OpportunityStatus.CHECKOUT_PENDING, commercialStatus: CommercialStatus.CHECKOUT_SENT,
      offerVersionId: 'offer-1', negotiationSnapshot: {}, wonAt: null,
    };
    const contract: any = {
      id: 'contract-pending', relationType: ContractRelationType.ORIGINAL, version: 1,
      contentHash: 'c'.repeat(64), parentContractId: null, acceptedAt: new Date('2026-08-18T12:00:00.000Z'),
      snapshot: {
        negotiation: {
          customerType: CustomerType.PERSON, cycle: 'MONTHLY', billingType: BillingType.BOLETO,
          allowedBillingTypes: [BillingType.BOLETO], participants: { dependentCount: 0 },
          pricing: { holderAmount: 100, dependentAmount: 25, finalAmount: 100 }, discounts: [],
        },
      },
    };
    const session: any = { id: 'pre-1', unitId: 'unit-1', checkoutSessionId: 'checkout-1', customerData: {} };
    const subscriptions = repository({
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation(async value => ({ id: 'sub-local', ...value })),
    });
    const sales = repository({ findOne: jest.fn().mockResolvedValue(null) });
    const opportunities = repository({ save: jest.fn(async value => value) });
    const lifecycle = { record: jest.fn().mockResolvedValue(undefined) };
    const { service } = createService({ subscriptions, sales, opportunities, lifecycle });

    const result = await (service as any).ensurePendingSubscriber({
      session, contract, opportunity,
      billingCustomer: { id: 'bc-1' }, externalSubscriptionId: 'asaas-sub-1',
      value: 100, cycle: 'MONTHLY', billingType: BillingType.BOLETO,
    });

    expect(result.status).toBe(SubscriptionStatus.PENDING_PAYMENT);
    expect(result.financialStatus).toBe(FinancialStatus.UNKNOWN);
    expect(result.accessStatus).toBe(AccessStatus.DISABLED);
    expect(result.metadata.contractId).toBe('contract-pending');
    expect(result.metadata.negotiationSnapshot.pricing.finalAmount).toBe(100);
    expect(sales.save).toHaveBeenCalledTimes(1);
    expect(opportunity.status).toBe(OpportunityStatus.WON);
    expect(opportunity.commercialStatus).toBe(CommercialStatus.CONVERTED);
    expect(lifecycle.record).toHaveBeenCalledWith(expect.objectContaining({ type: 'subscription.pending_payment' }));
  });

  it('não duplica assinante nem venda ao repetir a conversão do mesmo contrato', async () => {
    const existingSubscription: any = {
      id: 'sub-existing', unitId: 'unit-1', primaryPersonId: 'person-1', sourceOpportunityId: 'opp-1',
      status: SubscriptionStatus.PENDING_PAYMENT, metadata: {}, externalSubscriptionId: 'asaas-sub-1',
    };
    const subscriptions = repository({ findOne: jest.fn().mockResolvedValue(existingSubscription) });
    const sales = repository({ findOne: jest.fn().mockResolvedValue({ id: 'sale-existing' }) });
    const opportunity: any = {
      id: 'opp-1', unitId: 'unit-1', primaryPersonId: 'person-1', planPriceId: null, ownerUserId: 'seller-1',
      customerType: CustomerType.PERSON, status: OpportunityStatus.WON, commercialStatus: CommercialStatus.CONVERTED,
      negotiationSnapshot: {}, wonAt: new Date(), offerVersionId: null,
    };
    const contract: any = {
      id: 'contract-1', relationType: ContractRelationType.ORIGINAL, version: 1, contentHash: 'a'.repeat(64),
      parentContractId: null, acceptedAt: new Date(), snapshot: { negotiation: { customerType: CustomerType.PERSON, cycle: 'MONTHLY', participants: { dependentCount: 0 }, pricing: { finalAmount: 100 } } },
    };
    const { service } = createService({ subscriptions, sales });

    await (service as any).ensurePendingSubscriber({
      session: { id: 'pre-1', unitId: 'unit-1', checkoutSessionId: 'checkout-1', customerData: {} },
      contract, opportunity, billingCustomer: { id: 'bc-1' }, externalSubscriptionId: 'asaas-sub-1',
      value: 100, cycle: 'MONTHLY', billingType: BillingType.BOLETO,
    });

    expect(subscriptions.create).not.toHaveBeenCalled();
    expect(sales.save).not.toHaveBeenCalled();
  });

  it('PF mensal inclui e remove dependentes usando o preço histórico do contrato', async () => {
    async function revise(dependentCount: number) {
      const parent: any = {
        id: `contract-pf-${dependentCount}`, unitId: 'unit-1', opportunityId: `opp-pf-${dependentCount}`,
        version: 1, status: ContractStatus.ACCEPTED, templateCode: 'PF', templateVersionId: 'tpl-1', contentHash: 'd'.repeat(64),
        snapshot: { customer: {}, participants: [], negotiation: {
          customerType: CustomerType.PERSON, cycle: 'MONTHLY', billingType: BillingType.CREDIT_CARD,
          allowedBillingTypes: [BillingType.CREDIT_CARD], participants: { dependentCount: 1 },
          pricing: { holderAmount: 100, dependentAmount: 25, finalAmount: 125 }, discounts: [],
        } },
      };
      const opportunity: any = {
        id: parent.opportunityId, unitId: 'unit-1', customerType: CustomerType.PERSON, ownerUserId: 'admin-1',
        billingCycle: 'MONTHLY', billingType: BillingType.CREDIT_CARD, expectedValue: '125.00', negotiationSnapshot: parent.snapshot.negotiation,
      };
      const contracts = repository({
        findOne: jest.fn().mockResolvedValue(parent), find: jest.fn().mockResolvedValue([]),
        save: jest.fn().mockImplementation(async value => ({ id: `revision-${dependentCount}`, ...value })),
      });
      const sessions = repository({ find: jest.fn().mockResolvedValue([]), save: jest.fn().mockImplementation(async value => ({ id: `session-${dependentCount}`, ...value })) });
      const { service } = createService({ opportunities: repository({ findOne: jest.fn().mockResolvedValue(opportunity) }), contracts, sessions, pricing: new PricingService() });
      jest.spyOn(service as any, 'assertOpportunityAccess').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'audit').mockResolvedValue(undefined);
      return service.createContractRevision('unit-1', parent.id, {
        relationType: ContractRelationType.AMENDMENT,
        reason: dependentCount > 1 ? 'Inclusão de dependente mensal' : 'Remoção de dependente mensal',
        changes: { dependentCount }, requiresPayment: false,
      }, 'admin-1', UnitRole.ADMIN, GlobalRole.STANDARD);
    }

    const added = await revise(2);
    expect(added.contract.snapshot.negotiation.pricing.holderAmount).toBe(100);
    expect(added.contract.snapshot.negotiation.pricing.dependentAmount).toBe(25);
    expect(added.contract.snapshot.negotiation.pricing.finalAmount).toBe(150);

    const removed = await revise(0);
    expect(removed.contract.snapshot.negotiation.pricing.holderAmount).toBe(100);
    expect(removed.contract.snapshot.negotiation.pricing.dependentAmount).toBe(25);
    expect(removed.contract.snapshot.negotiation.pricing.finalAmount).toBe(100);
  });

  it('PJ aumenta e reduz vidas faturando pelo preço histórico por vida', async () => {
    async function revise(lives: number, activeBeneficiaries: number) {
      const parent: any = {
        id: `contract-pj-${lives}`, unitId: 'unit-1', opportunityId: `opp-pj-${lives}`,
        version: 1, status: ContractStatus.ACCEPTED, templateCode: 'PJ', templateVersionId: 'tpl-pj', contentHash: 'e'.repeat(64),
        snapshot: { customer: {}, participants: [], negotiation: {
          customerType: CustomerType.COMPANY, cycle: 'MONTHLY', billingType: BillingType.BOLETO,
          allowedBillingTypes: [BillingType.BOLETO], participants: { contractedLives: 10 },
          pricing: { unitPrice: 30, finalAmount: 300 }, discounts: [],
        } },
      };
      const opportunity: any = {
        id: parent.opportunityId, unitId: 'unit-1', customerType: CustomerType.COMPANY, ownerUserId: 'admin-1',
        billingCycle: 'MONTHLY', billingType: BillingType.BOLETO, expectedValue: '300.00', negotiationSnapshot: parent.snapshot.negotiation,
      };
      const contracts = repository({
        findOne: jest.fn().mockResolvedValue(parent), find: jest.fn().mockResolvedValue([]),
        save: jest.fn().mockImplementation(async value => ({ id: `revision-pj-${lives}`, ...value })),
      });
      const sessions = repository({ find: jest.fn().mockResolvedValue([]), save: jest.fn().mockImplementation(async value => ({ id: `session-pj-${lives}`, ...value })) });
      const subscriptions = repository({ findOne: jest.fn().mockResolvedValue({ id: 'sub-pj' }) });
      const subscriptionMembers = repository({ count: jest.fn().mockResolvedValue(activeBeneficiaries), find: jest.fn().mockResolvedValue([]) });
      const { service } = createService({ opportunities: repository({ findOne: jest.fn().mockResolvedValue(opportunity) }), contracts, sessions, subscriptions, subscriptionMembers, pricing: new PricingService() });
      jest.spyOn(service as any, 'assertOpportunityAccess').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'audit').mockResolvedValue(undefined);
      return service.createContractRevision('unit-1', parent.id, {
        relationType: ContractRelationType.AMENDMENT, reason: 'Ajuste de vidas contratadas', changes: { lives }, requiresPayment: false,
      }, 'admin-1', UnitRole.ADMIN, GlobalRole.STANDARD);
    }

    const increased = await revise(12, 8);
    expect(increased.contract.snapshot.negotiation.pricing.unitPrice).toBe(30);
    expect(increased.contract.snapshot.negotiation.pricing.finalAmount).toBe(360);
    const reduced = await revise(8, 5);
    expect(reduced.contract.snapshot.negotiation.pricing.unitPrice).toBe(30);
    expect(reduced.contract.snapshot.negotiation.pricing.finalAmount).toBe(240);
  });

  it('aplica aditivo aceito na assinatura existente e atualiza parcelas pendentes no Asaas', async () => {
    const opportunity: any = {
      id: 'opp-change', unitId: 'unit-1', customerType: CustomerType.PERSON, primaryPersonId: 'person-1',
      billingCycle: 'MONTHLY', billingType: BillingType.CREDIT_CARD, expectedValue: '100.00', negotiationSnapshot: {},
    };
    const subscription: any = {
      id: 'sub-change', unitId: 'unit-1', primaryPersonId: 'person-1', externalSubscriptionId: 'asaas-sub-change',
      sourceOpportunityId: opportunity.id, metadata: { contractedAmount: 100, billingCycle: 'MONTHLY', billingType: BillingType.CREDIT_CARD },
    };
    const contract: any = {
      id: 'contract-change', unitId: 'unit-1', opportunityId: opportunity.id, version: 2,
      relationType: ContractRelationType.AMENDMENT, parentContractId: 'contract-old', contentHash: 'f'.repeat(64), requiresPayment: false,
      snapshot: { negotiation: {
        customerType: CustomerType.PERSON, cycle: 'MONTHLY', billingType: BillingType.CREDIT_CARD,
        allowedBillingTypes: [BillingType.CREDIT_CARD], participants: { dependentCount: 2 },
        pricing: { holderAmount: 100, dependentAmount: 25, finalAmount: 150 }, discounts: [],
      } },
    };
    const opportunities = repository({ findOne: jest.fn().mockResolvedValue(opportunity), save: jest.fn(async value => value) });
    const subscriptions = repository({ findOne: jest.fn().mockResolvedValue(subscription), save: jest.fn(async value => value) });
    const asaas = {
      updateSubscription: jest.fn().mockResolvedValue({ id: 'asaas-sub-change' }),
      createSubscription: jest.fn(),
      deleteSubscription: jest.fn(),
    };
    const lifecycle = { record: jest.fn().mockResolvedValue(undefined) };
    const { service } = createService({ opportunities, subscriptions, asaas, lifecycle });
    jest.spyOn(service as any, 'audit').mockResolvedValue(undefined);

    await (service as any).applyAcceptedRevision(contract, { pricingSnapshot: contract.snapshot.negotiation } as any);

    expect(asaas.updateSubscription).toHaveBeenCalledWith('unit-1', 'asaas-sub-change', expect.objectContaining({
      value: 150, cycle: 'MONTHLY', billingType: BillingType.CREDIT_CARD, updatePendingPayments: true,
    }));
    expect(asaas.createSubscription).not.toHaveBeenCalled();
    expect(asaas.deleteSubscription).not.toHaveBeenCalled();
    expect(subscription.metadata.contractId).toBe('contract-change');
    expect(subscription.metadata.contractedAmount).toBe(150);
    expect(opportunity.expectedValue).toBe('150.00');
  });

  it('não grava alteração contratual local se a atualização da assinatura no Asaas falhar', async () => {
    const opportunity: any = { id: 'opp-fail', unitId: 'unit-1', customerType: CustomerType.PERSON, billingCycle: 'MONTHLY', billingType: BillingType.CREDIT_CARD, expectedValue: '100.00' };
    const subscription: any = { id: 'sub-fail', unitId: 'unit-1', primaryPersonId: 'person-1', externalSubscriptionId: 'asaas-sub-fail', sourceOpportunityId: opportunity.id, metadata: { contractedAmount: 100, billingCycle: 'MONTHLY', billingType: BillingType.CREDIT_CARD } };
    const contract: any = { id: 'contract-fail', unitId: 'unit-1', opportunityId: opportunity.id, version: 2, relationType: ContractRelationType.AMENDMENT, parentContractId: 'contract-old', contentHash: '1'.repeat(64), snapshot: { negotiation: { cycle: 'MONTHLY', allowedBillingTypes: [BillingType.CREDIT_CARD], pricing: { finalAmount: 150 }, participants: { dependentCount: 1 } } } };
    const opportunities = repository({ findOne: jest.fn().mockResolvedValue(opportunity), save: jest.fn() });
    const subscriptions = repository({ findOne: jest.fn().mockResolvedValue(subscription), save: jest.fn() });
    const asaas = { updateSubscription: jest.fn().mockRejectedValue(new Error('timeout Asaas')) };
    const { service } = createService({ opportunities, subscriptions, asaas });

    await expect((service as any).applyAcceptedRevision(contract, {} as any)).rejects.toThrow('timeout Asaas');
    expect(opportunities.save).not.toHaveBeenCalled();
    expect(subscriptions.save).not.toHaveBeenCalled();
    expect(subscription.metadata.contractedAmount).toBe(100);
  });

  it('cria aprovação obrigatória para alteração contratual fora da política comercial', async () => {
    const parent: any = {
      id: 'contract-policy', unitId: 'unit-1', opportunityId: 'opp-policy', version: 1,
      status: ContractStatus.ACCEPTED, templateCode: 'PF', templateVersionId: 'tpl-1', contentHash: '2'.repeat(64),
      snapshot: { customer: {}, participants: [], negotiation: {
        customerType: CustomerType.PERSON, cycle: 'MONTHLY', billingType: BillingType.CREDIT_CARD,
        allowedBillingTypes: [BillingType.CREDIT_CARD], participants: { dependentCount: 0 },
        pricing: { holderAmount: 100, dependentAmount: 20, finalAmount: 100 }, discounts: [],
      } },
    };
    const opportunity: any = { id: 'opp-policy', unitId: 'unit-1', customerType: CustomerType.PERSON, ownerUserId: 'seller-1', billingCycle: 'MONTHLY', billingType: BillingType.CREDIT_CARD, expectedValue: '100.00', negotiationSnapshot: parent.snapshot.negotiation };
    const policies = repository({ find: jest.fn().mockResolvedValue([{ targetUserId: 'seller-1', targetRole: null, targetTeamId: null, maxDiscountPercent: '0', maxDiscountAmount: null, minUnitPrice: null, allowedBillingTypes: [], active: true, rules: {} }]) });
    const approvals = repository({
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation(async value => ({ id: 'approval-revision', ...value })),
    });
    const contracts = repository({ findOne: jest.fn().mockResolvedValue(parent), find: jest.fn().mockResolvedValue([]) });
    const pricing = new PricingService();
    const { service } = createService({ opportunities: repository({ findOne: jest.fn().mockResolvedValue(opportunity) }), policies, approvals, contracts, pricing });
    jest.spyOn(service as any, 'assertOpportunityAccess').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'audit').mockResolvedValue(undefined);

    await expect(service.createContractRevision('unit-1', parent.id, {
      relationType: ContractRelationType.AMENDMENT, reason: 'Condição excepcional de retenção',
      changes: { discounts: [{ type: 'PERCENTAGE', value: 10, reason: 'Retenção' }] }, requiresPayment: false,
    }, 'seller-1', UnitRole.SALES, GlobalRole.STANDARD)).rejects.toBeInstanceOf(BadRequestException);

    expect(approvals.save).toHaveBeenCalledWith(expect.objectContaining({
      status: ApprovalStatus.PENDING,
      requestedConditions: expect.objectContaining({ revisionContext: expect.objectContaining({ parentContractId: parent.id }) }),
    }));
  });

  it('aprova alteração contratual sem mudar o status comercial da oportunidade convertida', async () => {
    const approval: any = {
      id: 'approval-revision', opportunityId: 'opp-policy', status: ApprovalStatus.PENDING,
      requestedConditions: {
        pricing: { finalAmount: 90 },
        revisionContext: { parentContractId: 'contract-policy', parentContentHash: '3'.repeat(64), relationType: ContractRelationType.AMENDMENT },
      },
    };
    const approvals = repository({ findOne: jest.fn().mockResolvedValue(approval), save: jest.fn(async value => value) });
    const opportunity: any = { id: 'opp-policy', commercialStatus: CommercialStatus.CONVERTED, negotiationSnapshot: { pricing: { finalAmount: 100 } } };
    const opportunities = repository({ findOneByOrFail: jest.fn().mockResolvedValue(opportunity), save: jest.fn() });
    const contracts = repository({ findOne: jest.fn().mockResolvedValue({ id: 'contract-policy', status: ContractStatus.ACCEPTED, contentHash: '3'.repeat(64) }) });
    const { service } = createService({ approvals, opportunities, contracts });
    jest.spyOn(service as any, 'audit').mockResolvedValue(undefined);

    const result = await service.decide('unit-1', 'approval-revision', 'manager-1', { decision: 'APPROVED', notes: 'Exceção aprovada' });

    expect(result.status).toBe(ApprovalStatus.APPROVED);
    expect(opportunity.commercialStatus).toBe(CommercialStatus.CONVERTED);
    expect(opportunities.save).not.toHaveBeenCalled();
  });


  it('não reaproveita aprovação de alteração contratual se hash ou tipo da revisão mudar', async () => {
    const snapshot: any = {
      customerType: CustomerType.PERSON,
      cycle: 'MONTHLY',
      billingType: BillingType.CREDIT_CARD,
      allowedBillingTypes: [BillingType.CREDIT_CARD],
      participants: { dependentCount: 1 },
      pricing: { holderAmount: 100, dependentAmount: 25, finalAmount: 125 },
      discounts: [],
    };
    const approvals = repository({ find: jest.fn().mockResolvedValue([
      {
        id: 'approval-stale-hash',
        status: ApprovalStatus.APPROVED,
        requestedConditions: {
          ...snapshot,
          revisionContext: {
            parentContractId: 'contract-base',
            parentContentHash: 'a'.repeat(64),
            relationType: ContractRelationType.AMENDMENT,
          },
        },
      },
      {
        id: 'approval-wrong-type',
        status: ApprovalStatus.APPROVED,
        requestedConditions: {
          ...snapshot,
          revisionContext: {
            parentContractId: 'contract-base',
            parentContentHash: 'b'.repeat(64),
            relationType: ContractRelationType.RENEWAL,
          },
        },
      },
    ]) });
    const { service } = createService({ approvals });

    const result = await (service as any).currentRevisionApproval(
      'unit-1',
      'opp-1',
      snapshot,
      'contract-base',
      'b'.repeat(64),
      ContractRelationType.AMENDMENT,
    );

    expect(result).toBeNull();
  });

});
