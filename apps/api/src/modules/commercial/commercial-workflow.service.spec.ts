import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  CommercialStatus,
  CustomerType,
  GlobalRole,
  PrecheckoutStatus,
  UnitRole,
} from '../../database/entities';
import { CommercialWorkflowService } from './commercial-workflow.service';

function repository(overrides: Record<string, jest.Mock> = {}) {
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
  subscriptions?: any;
  pricing?: any;
  asaas?: any;
} = {}) {
  const policies = options.policies || repository({ find: jest.fn().mockResolvedValue([]) });
  const approvals = options.approvals || repository({ find: jest.fn().mockResolvedValue([]) });
  const opportunities = options.opportunities || repository();
  const sessions = options.sessions || repository();
  const contracts = options.contracts || repository();
  const subscriptions = options.subscriptions || repository();
  const service = new CommercialWorkflowService(
    policies,
    approvals,
    opportunities,
    repository(), // people
    contracts,
    repository(), // acceptances
    sessions,
    repository(), // participants
    repository(), // opportunity members
    repository(), // team members
    repository(), // offer versions
    repository(), // template versions
    repository(), // audit logs
    repository(), // billing customers
    repository(), // checkout sessions
    subscriptions,
    options.pricing || { calculate: jest.fn() } as any,
    options.asaas || { createCheckout: jest.fn() } as any,
    options.feature || { assertEnabled: jest.fn() },
  );
  return { service, policies, approvals, opportunities, sessions, contracts, subscriptions };
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

});
