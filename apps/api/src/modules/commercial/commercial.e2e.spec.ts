import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { CommercialController, PublicOffersController, PublicPrecheckoutController } from './commercial.controller';
import { CommercialConfigService } from './commercial-config.service';
import { CommercialWorkflowService } from './commercial-workflow.service';
import { CommercialMetricsService } from './commercial-metrics.service';
import { CommercialFeatureService } from './commercial-feature.service';
import { PricingService } from './pricing.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UnitAccessGuard } from '../../common/guards/unit-access.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { GlobalRole, UnitRole } from '../../database/entities';
import { ThrottlerGuard } from '@nestjs/throttler';

describe('Fluxos comerciais HTTP (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  const workflow = {
    requestApproval: jest.fn(),
    decide: jest.fn(),
    createPrecheckout: jest.fn(),
    publicGet: jest.fn(),
    updateCustomer: jest.fn(),
    updateCompanyContacts: jest.fn(),
    addParticipant: jest.fn(),
    removeParticipant: jest.fn(),
    prepareContract: jest.fn(),
    accept: jest.fn(),
    startAsaasCheckout: jest.fn(),
    listPolicies: jest.fn(),
    savePolicy: jest.fn(),
    listApprovals: jest.fn(),
    evaluateOpportunity: jest.fn(),
    revokePrecheckout: jest.fn(),
    listContracts: jest.fn(),
    createContractRevision: jest.fn(),
  };
  const config = {
    publicOffer: jest.fn(),
    simulatePublicOffer: jest.fn(),
    startPublicOffer: jest.fn(),
    listOffers: jest.fn(),
    saveOffer: jest.fn(),
    createOfferVersion: jest.fn(),
    publishOfferVersion: jest.fn(),
    listPipelines: jest.fn(),
    createPipeline: jest.fn(),
    createStage: jest.fn(),
    listTemplates: jest.fn(),
    createTemplate: jest.fn(),
    createTemplateVersion: jest.fn(),
    publishTemplateVersion: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CommercialController, PublicOffersController, PublicPrecheckoutController],
      providers: [
        { provide: CommercialWorkflowService, useValue: workflow },
        { provide: CommercialConfigService, useValue: config },
        { provide: CommercialMetricsService, useValue: { summary: jest.fn() } },
        { provide: CommercialFeatureService, useValue: { status: jest.fn(), setEnabled: jest.fn() } },
        { provide: PricingService, useValue: { calculate: jest.fn() } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: any) {
          context.switchToHttp().getRequest().user = {
            id: 'user-1',
            globalRole: GlobalRole.STANDARD,
          };
          return true;
        },
      })
      .overrideGuard(UnitAccessGuard)
      .useValue({
        canActivate(context: any) {
          const request = context.switchToHttp().getRequest();
          request.unitId = 'unit-1';
          request.membership = {
            userId: 'user-1',
            unitId: 'unit-1',
            role: UnitRole.MANAGER,
            active: true,
          };
          return true;
        },
      })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  async function request(path: string, init?: RequestInit) {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      ...init,
    });
    const body = await response.json();
    return { status: response.status, body };
  }

  it('inicia checkout genérico de pessoa física por oferta pública', async () => {
    config.startPublicOffer.mockResolvedValue({
      opportunityId: 'opportunity-public',
      precheckout: { url: '/checkout/token-public' },
    });

    const result = await request('/public/offers/familiar/start', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Pessoa Cliente',
        taxId: '52998224725',
        email: 'cliente@example.com',
        phone: '11999999999',
        postalCode: '01001000',
        address: 'Praça da Sé',
        addressNumber: '1',
        district: 'Sé',
        city: 'São Paulo',
        state: 'SP',
        dependentCount: 1,
        participants: [
          { name: 'Dependente', taxId: '11144477735', relationship: 'FILHO' },
        ],
      }),
    });

    expect(result.status).toBe(201);
    expect(result.body.precheckout.url).toBe('/checkout/token-public');
    expect(config.startPublicOffer).toHaveBeenCalledWith(
      'familiar',
      expect.objectContaining({ dependentCount: 1 }),
    );
  });

  it('executa o fluxo HTTP do pré-checkout PF até o checkout Asaas', async () => {
    workflow.publicGet.mockResolvedValue({
      status: 'CREATED',
      customerType: 'PERSON',
      participants: [],
      contract: null,
    });
    workflow.updateCustomer.mockResolvedValue({ status: 'DATA_COMPLETED' });
    workflow.addParticipant.mockResolvedValue({ status: 'DATA_COMPLETED', participants: [{ id: 'dependent-1' }] });
    workflow.prepareContract.mockResolvedValue({ status: 'CONTRACT_READY', contract: { id: 'contract-1' } });
    workflow.accept.mockResolvedValue({ status: 'ACCEPTED', contract: { id: 'contract-1', status: 'ACCEPTED' } });
    workflow.startAsaasCheckout.mockResolvedValue({ checkoutLink: 'https://asaas.example/checkout-1' });

    expect((await request('/public/precheckout/token-pf')).status).toBe(200);
    expect((await request('/public/precheckout/token-pf/customer', {
      method: 'PATCH',
      body: JSON.stringify({
        name: 'Pessoa Cliente',
        taxId: '52998224725',
        email: 'cliente@example.com',
        phone: '11999999999',
        postalCode: '01001000',
        address: 'Praça da Sé',
        addressNumber: '1',
        district: 'Sé',
        city: 'São Paulo',
        state: 'SP',
      }),
    })).status).toBe(200);
    expect((await request('/public/precheckout/token-pf/participants', {
      method: 'POST',
      body: JSON.stringify({ name: 'Dependente', taxId: '11144477735' }),
    })).status).toBe(201);
    expect((await request('/public/precheckout/token-pf/contract', { method: 'POST' })).status).toBe(201);
    expect((await request('/public/precheckout/token-pf/accept', {
      method: 'POST',
      body: JSON.stringify({
        accepted: true,
        acceptedByName: 'Pessoa Cliente',
        acceptedByTaxId: '52998224725',
      }),
    })).status).toBe(201);
    const payment = await request('/public/precheckout/token-pf/payment', {
      method: 'POST',
      body: JSON.stringify({ billingType: 'CREDIT_CARD' }),
    });
    expect(payment.status).toBe(201);
    expect(payment.body.checkoutLink).toContain('asaas.example');
  });

  it('aprova uma negociação PJ antes de gerar o pré-checkout', async () => {
    workflow.requestApproval.mockResolvedValue({ id: 'approval-1', status: 'PENDING' });
    workflow.decide.mockResolvedValue({ id: 'approval-1', status: 'APPROVED' });
    workflow.createPrecheckout.mockResolvedValue({ url: '/checkout/token-pj' });

    const requestApproval = await request('/commercial/opportunities/opportunity-pj/request-approval', {
      method: 'POST',
      body: JSON.stringify({ reason: 'Condição empresarial negociada' }),
    });
    expect(requestApproval.status).toBe(201);

    const decision = await request('/commercial/approvals/approval-1/decision', {
      method: 'POST',
      body: JSON.stringify({ decision: 'APPROVED', notes: 'Condição autorizada.' }),
    });
    expect(decision.status).toBe(201);

    const precheckout = await request('/commercial/opportunities/opportunity-pj/precheckout', {
      method: 'POST',
      body: JSON.stringify({ expiresInDays: 7 }),
    });
    expect(precheckout.status).toBe(201);
    expect(precheckout.body.url).toBe('/checkout/token-pj');
    expect(workflow.createPrecheckout).toHaveBeenCalledWith(
      'unit-1',
      'opportunity-pj',
      7,
      'user-1',
      UnitRole.MANAGER,
      GlobalRole.STANDARD,
    );
  });
});
