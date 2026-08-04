import { BadRequestException } from '@nestjs/common';
import {
  BillingConnection,
  BillingEnvironment,
  BillingProviderName,
  GlobalRole,
  Unit,
  User,
} from '../../database/entities';
import { ASAAS_WEBHOOK_EVENTS, BillingService } from './billing.service';

describe('BillingService', () => {
  const actor = { id: 'user-1', globalRole: GlobalRole.STANDARD } as User;
  const unit = { id: 'unit-1', slug: 'filial-centro', name: 'Filial Centro', active: true } as Unit;
  let connection: BillingConnection;
  let repository: any;
  let unitRepository: any;
  let encryption: any;
  let asaas: any;
  let audit: any;
  let service: BillingService;
  const previousPublicApiUrl = process.env.PUBLIC_API_URL;

  beforeEach(() => {
    process.env.PUBLIC_API_URL = 'https://api.exemplo.com';
    process.env.ASAAS_MOCK = 'false';
    connection = {
      id: 'connection-1',
      unitId: unit.id,
      provider: BillingProviderName.ASAAS,
      environment: BillingEnvironment.SANDBOX,
      apiKeyEncrypted: 'enc-api-key',
      webhookSecretEncrypted: 'enc-webhook-secret',
      webhookSecretHash: 'hash',
      externalWebhookId: 'webhook-1',
      webhookEmail: 'alertas@example.com',
      webhookUrl: 'https://api.exemplo.com/api/webhooks/asaas/filial-centro',
      remoteAccountNumber: null,
      enabled: true,
      lastValidatedAt: null,
      lastError: null,
      lastWebhookSyncAt: null,
      lastWebhookError: null,
    } as BillingConnection;
    repository = {
      findOne: jest.fn(async () => connection),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    unitRepository = { findOne: jest.fn(async () => unit) };
    encryption = {
      encrypt: jest.fn((value: string) => `encrypted:${value}`),
      decrypt: jest.fn((value: string) => value === 'enc-api-key' ? '$aact_hmlg_test' : 'a'.repeat(64)),
    };
    asaas = {
      validate: jest.fn(async () => ({ agency: '0001', account: '123456-7' })),
      getWebhook: jest.fn(async () => ({
        id: 'webhook-1',
        name: 'Gestão de Clubes - Filial Centro [filial-centro]',
        url: connection.webhookUrl,
        email: connection.webhookEmail,
        enabled: true,
        interrupted: false,
        sendType: 'SEQUENTIALLY',
        events: [...ASAAS_WEBHOOK_EVENTS],
        hasAuthToken: true,
      })),
      listWebhooks: jest.fn(async () => ({ data: [] })),
      createWebhook: jest.fn(),
      updateWebhook: jest.fn(),
    };
    audit = { record: jest.fn(async () => undefined) };
    service = new BillingService(repository, unitRepository, encryption, asaas, audit);
  });

  afterAll(() => {
    process.env.PUBLIC_API_URL = previousPublicApiUrl;
  });

  it('não troca ambiente mantendo silenciosamente a chave do ambiente anterior', async () => {
    await expect(service.configure(unit.id, {
      environment: BillingEnvironment.PRODUCTION,
      enabled: true,
    }, actor)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('invalida vínculo remoto quando uma nova chave é salva', async () => {
    await service.configure(unit.id, {
      environment: BillingEnvironment.SANDBOX,
      apiKey: '$aact_hmlg_new-key',
      enabled: true,
      webhookEmail: 'novo@example.com',
    }, actor);

    expect(connection.externalWebhookId).toBeNull();
    expect(connection.webhookSecretEncrypted).toBeNull();
    expect(connection.remoteAccountNumber).toBeNull();
    expect(connection.webhookEmail).toBe('novo@example.com');
  });

  it('mantém setup de webhook idempotente quando a configuração remota já está correta', async () => {
    const result = await service.setupWebhook(unit.id, actor);

    expect(result.action).toBe('UNCHANGED');
    expect(asaas.createWebhook).not.toHaveBeenCalled();
    expect(asaas.updateWebhook).not.toHaveBeenCalled();
    expect(asaas.validate).toHaveBeenCalledTimes(1);
  });

  it('atualiza webhook remoto quando o Asaas informa ausência de token', async () => {
    asaas.getWebhook.mockResolvedValueOnce({
      id: 'webhook-1',
      name: 'Gestão de Clubes - Filial Centro [filial-centro]',
      url: connection.webhookUrl,
      email: connection.webhookEmail,
      enabled: true,
      interrupted: false,
      sendType: 'SEQUENTIALLY',
      events: [...ASAAS_WEBHOOK_EVENTS],
      hasAuthToken: false,
    });
    asaas.updateWebhook.mockImplementation(async (_unitId: string, id: string, payload: any) => ({ id, ...payload }));

    const result = await service.setupWebhook(unit.id, actor);

    expect(result.action).toBe('UPDATED');
    expect(asaas.updateWebhook).toHaveBeenCalledWith(
      unit.id,
      'webhook-1',
      expect.objectContaining({ apiVersion: 3, email: 'alertas@example.com' }),
    );
  });
  it('revela o token do webhook somente a partir do valor criptografado e audita o acesso', async () => {
    const result = await service.revealWebhookSecret(unit.id, actor);

    expect(result).toEqual({ token: 'a'.repeat(64) });
    expect(encryption.decrypt).toHaveBeenCalledWith('enc-webhook-secret');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      unitId: unit.id,
      actorUserId: actor.id,
      action: 'billing.webhook.secret.revealed',
      resourceId: connection.id,
    }));
  });

});
