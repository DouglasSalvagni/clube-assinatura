import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BillingConnection,
  BillingEnvironment,
  BillingProviderName,
  Unit,
  User,
} from '../../database/entities';
import { AuditService } from '../audit/audit.service';
import { AsaasClient } from './asaas.client';
import { ConfigureBillingDto } from './billing.dto';
import { EncryptionService } from './encryption.service';

export const ASAAS_WEBHOOK_EVENTS = [
  'PAYMENT_CREATED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_RECEIVED',
  'PAYMENT_OVERDUE',
  'PAYMENT_REFUNDED',
  'PAYMENT_DELETED',
  'SUBSCRIPTION_CREATED',
  'SUBSCRIPTION_UPDATED',
  'SUBSCRIPTION_INACTIVATED',
  'SUBSCRIPTION_DELETED',
  'CHECKOUT_CREATED',
  'CHECKOUT_CANCELED',
  'CHECKOUT_EXPIRED',
  'CHECKOUT_PAID',
] as const;

@Injectable()
export class BillingService {
  constructor(
    @InjectRepository(BillingConnection)
    private readonly repository: Repository<BillingConnection>,
    @InjectRepository(Unit)
    private readonly unitRepository: Repository<Unit>,
    private readonly encryption: EncryptionService,
    private readonly asaas: AsaasClient,
    private readonly audit: AuditService,
  ) {}

  async get(unitId: string) {
    const connection = await this.repository.findOne({
      where: { unitId, provider: BillingProviderName.ASAAS },
    });

    return {
      configured: Boolean(connection?.apiKeyEncrypted),
      enabled: connection?.enabled || false,
      environment: connection?.environment || BillingEnvironment.SANDBOX,
      provider: BillingProviderName.ASAAS,
      apiKeyMasked: connection?.apiKeyEncrypted ? '••••••••••••' : null,
      webhookConfigured: Boolean(connection?.externalWebhookId),
      webhookId: connection?.externalWebhookId || null,
      lastValidatedAt: connection?.lastValidatedAt || null,
      lastError: connection?.lastError || null,
      events: ASAAS_WEBHOOK_EVENTS,
    };
  }

  async configure(unitId: string, dto: ConfigureBillingDto, actor: User) {
    let connection = await this.repository.findOne({
      where: { unitId, provider: BillingProviderName.ASAAS },
    });

    if (!connection) {
      connection = this.repository.create({
        unitId,
        provider: BillingProviderName.ASAAS,
        environment: dto.environment,
        apiKeyEncrypted: null,
        webhookSecretEncrypted: null,
        webhookSecretHash: null,
        externalWebhookId: null,
        enabled: false,
        lastValidatedAt: null,
        lastError: null,
      });
    }

    const before = this.sanitize(connection);
    connection.environment = dto.environment;
    if (dto.apiKey) connection.apiKeyEncrypted = this.encryption.encrypt(dto.apiKey.trim());
    if (dto.webhookSecret) {
      connection.webhookSecretEncrypted = this.encryption.encrypt(dto.webhookSecret);
      connection.webhookSecretHash = this.hash(dto.webhookSecret);
    }
    if (dto.enabled !== undefined) connection.enabled = dto.enabled;

    connection = await this.repository.save(connection);
    await this.audit.record({
      unitId,
      actorUserId: actor.id,
      action: 'billing.connection.updated',
      resourceType: 'billing_connection',
      resourceId: connection.id,
      beforeData: before,
      afterData: this.sanitize(connection),
    });
    return this.get(unitId);
  }

  async test(unitId: string) {
    const connection = await this.repository.findOne({
      where: { unitId, provider: BillingProviderName.ASAAS },
    });
    if (!connection) throw new NotFoundException('Conexão não configurada.');

    try {
      await this.asaas.validate(unitId);
      connection.lastValidatedAt = new Date();
      connection.lastError = null;
      await this.repository.save(connection);
      return { success: true, validatedAt: connection.lastValidatedAt };
    } catch (error: any) {
      connection.lastError = error.message;
      await this.repository.save(connection);
      throw error;
    }
  }

  async setupWebhook(unitId: string) {
    const unit = await this.unitRepository.findOne({ where: { id: unitId } });
    if (!unit) throw new NotFoundException('Unidade não encontrada.');

    let connection = await this.repository.findOne({
      where: { unitId, provider: BillingProviderName.ASAAS },
    });
    if (!connection?.apiKeyEncrypted && process.env.ASAAS_MOCK !== 'true') {
      throw new NotFoundException('Configure a chave da API antes do webhook.');
    }
    if (!connection) {
      connection = this.repository.create({
        unitId,
        provider: BillingProviderName.ASAAS,
        environment: BillingEnvironment.SANDBOX,
        apiKeyEncrypted: null,
        webhookSecretEncrypted: null,
        webhookSecretHash: null,
        externalWebhookId: null,
        enabled: true,
        lastValidatedAt: null,
        lastError: null,
      });
    }

    const secret = randomBytes(32).toString('hex');
    const baseUrl = (process.env.API_URL || 'http://localhost:4003').replace(/\/$/, '');
    const url = `${baseUrl}/api/webhooks/asaas/${unit.slug}`;
    const payload: Record<string, unknown> = {
      name: `${process.env.APP_NAME || 'Gestão de Clubes'} - ${unit.name}`,
      url,
      events: ASAAS_WEBHOOK_EVENTS,
      authToken: secret,
      sendType: 'SEQUENTIALLY',
      enabled: true,
      interrupted: false,
    };
    if (process.env.ASAAS_WEBHOOK_ALERT_EMAIL) payload.email = process.env.ASAAS_WEBHOOK_ALERT_EMAIL;

    const webhook = connection.externalWebhookId
      ? await this.asaas.updateWebhook(unitId, connection.externalWebhookId, payload)
      : await this.asaas.createWebhook(unitId, payload);

    connection.webhookSecretEncrypted = this.encryption.encrypt(secret);
    connection.webhookSecretHash = this.hash(secret);
    connection.externalWebhookId = webhook.id || connection.externalWebhookId;
    connection.enabled = true;
    connection.lastError = null;
    await this.repository.save(connection);

    return {
      webhookId: connection.externalWebhookId,
      url,
      configured: true,
      events: ASAAS_WEBHOOK_EVENTS,
    };
  }

  async webhookStatus(unitId: string) {
    const connection = await this.repository.findOne({
      where: { unitId, provider: BillingProviderName.ASAAS },
    });
    if (!connection?.externalWebhookId) return { webhookId: null, configured: false };

    try {
      return await this.asaas.getWebhook(unitId, connection.externalWebhookId);
    } catch {
      return {
        webhookId: connection.externalWebhookId,
        configured: true,
        error: 'Não foi possível consultar o status no Asaas.',
      };
    }
  }

  async removeBackoff(unitId: string) {
    const connection = await this.repository.findOne({
      where: { unitId, provider: BillingProviderName.ASAAS },
    });
    if (!connection?.externalWebhookId) throw new NotFoundException('Webhook não configurado.');
    await this.asaas.removeWebhookBackoff(unitId, connection.externalWebhookId);
    return { success: true };
  }

  async verifyWebhookSecret(unitId: string, provided: string | undefined) {
    const connection = await this.repository.findOne({
      where: { unitId, provider: BillingProviderName.ASAAS, enabled: true },
    });
    if (!connection?.webhookSecretHash) return process.env.ASAAS_MOCK === 'true';
    if (!provided) return false;

    const expected = Buffer.from(connection.webhookSecretHash, 'hex');
    const actual = Buffer.from(this.hash(provided), 'hex');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  async connectionEntity(unitId: string) {
    return this.repository.findOne({
      where: { unitId, provider: BillingProviderName.ASAAS, enabled: true },
    });
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private sanitize(connection: BillingConnection) {
    return {
      id: connection.id,
      unitId: connection.unitId,
      provider: connection.provider,
      environment: connection.environment,
      enabled: connection.enabled,
      externalWebhookId: connection.externalWebhookId,
      lastValidatedAt: connection.lastValidatedAt,
      lastError: connection.lastError,
    };
  }
}
