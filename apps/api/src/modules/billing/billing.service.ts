import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
import { AsaasApiException, AsaasClient } from './asaas.client';
import { ConfigureAsaasWebhookDto, ConfigureBillingDto } from './billing.dto';
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

type WebhookAction = 'CREATED' | 'UPDATED' | 'UNCHANGED' | 'RECOVERED';

interface RemoteWebhook {
  id?: string;
  name?: string;
  url?: string;
  email?: string;
  enabled?: boolean;
  interrupted?: boolean;
  sendType?: string;
  events?: string[];
  hasAuthToken?: boolean;
}

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

    const configured = Boolean(connection?.apiKeyEncrypted);
    const enabled = connection?.enabled || false;
    const publicWebhookUrl = connection?.webhookUrl || await this.tryWebhookUrl(unitId);

    return {
      configured,
      enabled,
      state: this.connectionState(connection),
      environment: connection?.environment || BillingEnvironment.SANDBOX,
      provider: BillingProviderName.ASAAS,
      apiKeyMasked: this.maskedApiKey(connection),
      apiKeyExpectedPrefix: this.expectedPrefix(connection?.environment || BillingEnvironment.SANDBOX),
      remoteAccountNumber: connection?.remoteAccountNumber || null,
      webhookEmail: connection?.webhookEmail || process.env.ASAAS_WEBHOOK_ALERT_EMAIL || '',
      webhookConfigured: Boolean(connection?.externalWebhookId),
      webhookState: this.webhookState(connection),
      webhookId: connection?.externalWebhookId || null,
      webhookUrl: publicWebhookUrl,
      lastValidatedAt: connection?.lastValidatedAt || null,
      lastError: connection?.lastError || null,
      lastWebhookSyncAt: connection?.lastWebhookSyncAt || null,
      lastWebhookError: connection?.lastWebhookError || null,
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
        webhookEmail: null,
        webhookUrl: null,
        remoteAccountNumber: null,
        enabled: false,
        lastValidatedAt: null,
        lastError: null,
        lastWebhookSyncAt: null,
        lastWebhookError: null,
      });
    }

    const before = this.sanitize(connection);
    const environmentChanged = connection.environment !== dto.environment;
    const apiKey = dto.apiKey?.trim();
    const credentialChanged = Boolean(apiKey);

    if (apiKey) this.validateKeyEnvironment(apiKey, dto.environment);
    if (environmentChanged && connection.apiKeyEncrypted && !apiKey) {
      throw new BadRequestException(
        'Ao trocar o ambiente do Asaas, informe também a chave correspondente ao novo ambiente.',
      );
    }
    if (dto.enabled === true && !apiKey && !connection.apiKeyEncrypted) {
      throw new BadRequestException('Informe uma chave da API antes de habilitar a integração.');
    }

    // Uma nova credencial pode pertencer a outra conta, mesmo no mesmo ambiente.
    // Limpar o vínculo remoto evita atualizar/excluir o webhook de uma conta anterior.
    if (environmentChanged || credentialChanged) {
      connection.externalWebhookId = null;
      connection.webhookSecretEncrypted = null;
      connection.webhookSecretHash = null;
      connection.webhookUrl = null;
      connection.lastWebhookSyncAt = null;
      connection.lastWebhookError = null;
      connection.lastValidatedAt = null;
      connection.remoteAccountNumber = null;
      connection.lastError = null;
    }

    connection.environment = dto.environment;
    if (apiKey) connection.apiKeyEncrypted = this.encryption.encrypt(apiKey);
    if (dto.webhookSecret) {
      connection.webhookSecretEncrypted = this.encryption.encrypt(dto.webhookSecret);
      connection.webhookSecretHash = this.hash(dto.webhookSecret);
    }
    if (dto.webhookEmail !== undefined) connection.webhookEmail = dto.webhookEmail.trim().toLowerCase();
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
    const connection = await this.requireConnection(unitId);

    try {
      const account = await this.asaas.validate(unitId);
      connection.lastValidatedAt = new Date();
      connection.remoteAccountNumber = this.accountNumber(account);
      connection.lastError = null;
      await this.repository.save(connection);
      return {
        success: true,
        state: 'CONNECTED',
        environment: connection.environment,
        accountNumber: connection.remoteAccountNumber,
        validatedAt: connection.lastValidatedAt,
      };
    } catch (error: any) {
      connection.lastError = this.errorMessage(error);
      await this.repository.save(connection);
      throw error;
    }
  }

  async setupWebhook(unitId: string, actor: User, dto: ConfigureAsaasWebhookDto = {}) {
    const unit = await this.unitRepository.findOne({ where: { id: unitId, active: true } });
    if (!unit) throw new NotFoundException('Unidade não encontrada.');

    let connection = await this.requireConnection(unitId);
    if (!connection.enabled) {
      throw new BadRequestException('Habilite e salve a integração antes de configurar o webhook.');
    }

    const email = dto.email?.trim().toLowerCase() || connection.webhookEmail || process.env.ASAAS_WEBHOOK_ALERT_EMAIL;
    if (!email) {
      throw new BadRequestException('Informe o e-mail de alertas do webhook e salve a configuração.');
    }

    const url = this.webhookUrl(unit);
    await this.test(unitId);
    connection = await this.requireConnection(unitId);

    const existingSecret = this.decryptOptional(connection.webhookSecretEncrypted);
    const secret = existingSecret || randomBytes(32).toString('hex');
    const payload = {
      name: dto.name?.trim() || this.webhookName(unit),
      url,
      email,
      enabled: dto.enabled ?? true,
      interrupted: false,
      apiVersion: 3,
      authToken: secret,
      sendType: dto.sendType || 'SEQUENTIALLY',
      events: this.validateWebhookEvents(dto.events),
    };

    let remote: RemoteWebhook | null = null;
    let action: WebhookAction = 'CREATED';

    try {
      if (connection.externalWebhookId) {
        remote = await this.getRemoteWebhookOrNull(unitId, connection.externalWebhookId);
      }

      if (!remote) {
        const matched = await this.findRemoteWebhook(
          unitId,
          url,
          payload.name,
          connection.webhookUrl,
        );
        if (matched) {
          remote = matched;
          connection.externalWebhookId = matched.id || null;
          action = 'RECOVERED';
        }
      }

      if (remote?.id) {
        if (existingSecret && !this.webhookChanged(remote, payload)) {
          action = action === 'RECOVERED' ? 'RECOVERED' : 'UNCHANGED';
        } else {
          remote = await this.asaas.updateWebhook(unitId, remote.id, payload);
          action = 'UPDATED';
        }
      } else {
        remote = await this.asaas.createWebhook(unitId, payload);
        action = 'CREATED';
      }

      if (!remote?.id) throw new BadRequestException('O Asaas não retornou o identificador do webhook.');

      connection.webhookSecretEncrypted = this.encryption.encrypt(secret);
      connection.webhookSecretHash = this.hash(secret);
      connection.externalWebhookId = remote.id;
      connection.webhookEmail = email;
      connection.webhookUrl = url;
      connection.enabled = true;
      connection.lastWebhookSyncAt = new Date();
      connection.lastWebhookError = null;
      await this.repository.save(connection);

      await this.audit.record({
        unitId,
        actorUserId: actor.id,
        action: `billing.webhook.${action.toLowerCase()}`,
        resourceType: 'billing_connection',
        resourceId: connection.id,
        beforeData: null,
        afterData: {
          webhookId: connection.externalWebhookId,
          webhookUrl: url,
          action,
          events: ASAAS_WEBHOOK_EVENTS,
        },
      });

      return {
        success: true,
        action,
        webhookId: connection.externalWebhookId,
        url,
        email,
        configured: true,
        enabled: remote.enabled ?? true,
        interrupted: remote.interrupted ?? false,
        events: remote.events || ASAAS_WEBHOOK_EVENTS,
        syncedAt: connection.lastWebhookSyncAt,
      };
    } catch (error: any) {
      connection.lastWebhookError = this.errorMessage(error);
      await this.repository.save(connection);
      throw error;
    }
  }


  async updateWebhook(unitId: string, actor: User, dto: ConfigureAsaasWebhookDto) {
    const connection = await this.requireConnection(unitId);
    if (!connection.externalWebhookId) {
      throw new NotFoundException('Webhook não configurado. Crie o webhook antes de editá-lo.');
    }
    const remote = await this.asaas.getWebhook(unitId, connection.externalWebhookId) as RemoteWebhook;
    const secret = this.decryptOptional(connection.webhookSecretEncrypted);
    if (!secret) {
      throw new BadRequestException('O token local do webhook não está disponível. Remova e recrie o webhook.');
    }
    const payload = {
      name: dto.name?.trim() || remote.name || 'Webhook Asaas',
      url: remote.url || connection.webhookUrl,
      email: dto.email?.trim().toLowerCase() || remote.email || connection.webhookEmail,
      enabled: dto.enabled ?? remote.enabled ?? true,
      interrupted: false,
      apiVersion: 3,
      authToken: secret,
      sendType: dto.sendType || remote.sendType || 'SEQUENTIALLY',
      events: this.validateWebhookEvents(dto.events || remote.events),
    };
    if (!payload.url || !payload.email) throw new BadRequestException('URL e e-mail do webhook são obrigatórios.');
    const updated = await this.asaas.updateWebhook(unitId, connection.externalWebhookId, payload) as RemoteWebhook;
    connection.webhookEmail = payload.email;
    connection.webhookUrl = payload.url;
    connection.lastWebhookSyncAt = new Date();
    connection.lastWebhookError = null;
    await this.repository.save(connection);
    await this.audit.record({
      unitId,
      actorUserId: actor.id,
      action: 'billing.webhook.updated',
      resourceType: 'billing_connection',
      resourceId: connection.id,
      beforeData: { webhookId: connection.externalWebhookId },
      afterData: { webhookId: connection.externalWebhookId, name: payload.name, enabled: payload.enabled, sendType: payload.sendType, events: payload.events },
    });
    return { success: true, webhookId: connection.externalWebhookId, ...updated, syncedAt: connection.lastWebhookSyncAt };
  }

  async revealWebhookSecret(unitId: string, actor: User) {
    const connection = await this.repository.findOne({
      where: { unitId, provider: BillingProviderName.ASAAS },
    });
    if (!connection?.externalWebhookId) {
      throw new NotFoundException('Webhook não configurado.');
    }

    const token = this.decryptOptional(connection.webhookSecretEncrypted);
    if (!token) {
      throw new NotFoundException(
        'O token de autenticação não está disponível localmente. Sincronize ou recrie o webhook.',
      );
    }

    await this.audit.record({
      unitId,
      actorUserId: actor.id,
      action: 'billing.webhook.secret.revealed',
      resourceType: 'billing_connection',
      resourceId: connection.id,
      beforeData: null,
      afterData: { webhookId: connection.externalWebhookId },
    });

    return { token };
  }

  async webhookStatus(unitId: string) {
    const connection = await this.repository.findOne({
      where: { unitId, provider: BillingProviderName.ASAAS },
    });
    if (!connection?.externalWebhookId) {
      return {
        webhookId: null,
        configured: false,
        reachable: false,
        url: connection?.webhookUrl || await this.tryWebhookUrl(unitId),
        error: null,
      };
    }

    try {
      const remote = await this.asaas.getWebhook(unitId, connection.externalWebhookId) as RemoteWebhook;
      connection.webhookUrl = remote.url || connection.webhookUrl;
      connection.webhookEmail = remote.email || connection.webhookEmail;
      connection.lastWebhookSyncAt = new Date();
      connection.lastWebhookError = null;
      await this.repository.save(connection);
      return {
        webhookId: connection.externalWebhookId,
        configured: true,
        reachable: true,
        name: remote.name || null,
        url: remote.url || connection.webhookUrl,
        email: remote.email || connection.webhookEmail,
        enabled: remote.enabled ?? null,
        interrupted: remote.interrupted ?? null,
        sendType: remote.sendType || null,
        hasAuthToken: remote.hasAuthToken ?? Boolean(connection.webhookSecretHash),
        events: remote.events || [],
        syncedAt: connection.lastWebhookSyncAt,
        error: null,
      };
    } catch (error: any) {
      const missing = error instanceof AsaasApiException && error.providerStatus === 404;
      connection.lastWebhookSyncAt = new Date();
      connection.lastWebhookError = this.errorMessage(error);
      if (missing) connection.externalWebhookId = null;
      await this.repository.save(connection);
      return {
        webhookId: missing ? null : connection.externalWebhookId,
        configured: !missing,
        reachable: false,
        url: connection.webhookUrl,
        error: missing
          ? 'O webhook salvo não existe mais no Asaas. Use “Configurar webhook” para recriá-lo.'
          : connection.lastWebhookError,
      };
    }
  }

  async removeWebhook(unitId: string, actor: User) {
    const connection = await this.repository.findOne({
      where: { unitId, provider: BillingProviderName.ASAAS },
    });
    if (!connection?.externalWebhookId) throw new NotFoundException('Webhook não configurado.');

    const webhookId = connection.externalWebhookId;
    try {
      await this.asaas.deleteWebhook(unitId, webhookId);
    } catch (error: any) {
      if (!(error instanceof AsaasApiException && error.providerStatus === 404)) throw error;
    }

    connection.externalWebhookId = null;
    connection.webhookSecretEncrypted = null;
    connection.webhookSecretHash = null;
    connection.webhookUrl = null;
    connection.lastWebhookSyncAt = new Date();
    connection.lastWebhookError = null;
    await this.repository.save(connection);

    await this.audit.record({
      unitId,
      actorUserId: actor.id,
      action: 'billing.webhook.removed',
      resourceType: 'billing_connection',
      resourceId: connection.id,
      beforeData: { webhookId },
      afterData: { webhookId: null },
    });

    return { success: true };
  }

  async removeBackoff(unitId: string, actor: User) {
    const connection = await this.repository.findOne({
      where: { unitId, provider: BillingProviderName.ASAAS },
    });
    if (!connection?.externalWebhookId) throw new NotFoundException('Webhook não configurado.');

    try {
      await this.asaas.removeWebhookBackoff(unitId, connection.externalWebhookId);
      connection.lastWebhookSyncAt = new Date();
      connection.lastWebhookError = null;
      await this.repository.save(connection);
      await this.audit.record({
        unitId,
        actorUserId: actor.id,
        action: 'billing.webhook.backoff_removed',
        resourceType: 'billing_connection',
        resourceId: connection.id,
        beforeData: null,
        afterData: { webhookId: connection.externalWebhookId },
      });
      return { success: true };
    } catch (error: any) {
      connection.lastWebhookError = this.errorMessage(error);
      await this.repository.save(connection);
      throw error;
    }
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

  private async requireConnection(unitId: string) {
    const connection = await this.repository.findOne({
      where: { unitId, provider: BillingProviderName.ASAAS },
    });
    if (!connection?.apiKeyEncrypted) throw new NotFoundException('Conexão Asaas não configurada.');
    return connection;
  }

  private async getRemoteWebhookOrNull(unitId: string, id: string): Promise<RemoteWebhook | null> {
    try {
      return await this.asaas.getWebhook(unitId, id);
    } catch (error) {
      if (error instanceof AsaasApiException && error.providerStatus === 404) return null;
      throw error;
    }
  }

  private async findRemoteWebhook(
    unitId: string,
    url: string,
    name: string,
    previousUrl?: string | null,
  ): Promise<RemoteWebhook | null> {
    const response = await this.asaas.listWebhooks(unitId, 100, 0);
    const webhooks: RemoteWebhook[] = Array.isArray(response?.data) ? response.data : [];
    return webhooks.find((item) => item.url === url)
      || (previousUrl ? webhooks.find((item) => item.url === previousUrl) : null)
      || webhooks.find((item) => item.name === name)
      || null;
  }


  private validateWebhookEvents(events?: string[]) {
    const requested = events?.length ? [...new Set(events.map((event) => String(event).trim()).filter(Boolean))] : [...ASAAS_WEBHOOK_EVENTS];
    const unsupported = requested.filter((event) => !ASAAS_WEBHOOK_EVENTS.includes(event as any));
    if (unsupported.length) throw new BadRequestException(`Eventos de webhook não permitidos: ${unsupported.join(', ')}.`);
    return requested;
  }

  private webhookChanged(remote: RemoteWebhook, expected: Record<string, any>) {
    const remoteEvents = [...(remote.events || [])].sort();
    const expectedEvents = [...expected.events].sort();
    return remote.name !== expected.name
      || remote.url !== expected.url
      || remote.email !== expected.email
      || remote.enabled !== true
      || remote.interrupted !== false
      || remote.sendType !== expected.sendType
      || remote.hasAuthToken === false
      || JSON.stringify(remoteEvents) !== JSON.stringify(expectedEvents);
  }

  private webhookName(unit: Unit) {
    return `${process.env.APP_NAME || 'Gestão de Clubes'} - ${unit.name} [${unit.slug}]`.slice(0, 180);
  }

  private webhookUrl(unit: Unit) {
    const raw = process.env.PUBLIC_API_URL || process.env.API_URL || process.env.APP_URL;
    if (!raw) {
      throw new BadRequestException('Configure PUBLIC_API_URL com a URL pública HTTPS da aplicação.');
    }

    let target: URL;
    try {
      target = new URL(raw);
    } catch {
      throw new BadRequestException('PUBLIC_API_URL/API_URL não contém uma URL válida.');
    }

    const isLocal = ['localhost', '127.0.0.1', 'host.docker.internal'].includes(target.hostname);
    if (process.env.ASAAS_MOCK !== 'true' && !isLocal && target.protocol !== 'https:') {
      throw new BadRequestException('A URL pública do webhook deve utilizar HTTPS.');
    }
    if (process.env.ASAAS_MOCK !== 'true' && isLocal) {
      throw new BadRequestException(
        'O Asaas não consegue acessar localhost. Configure PUBLIC_API_URL com o domínio público da aplicação.',
      );
    }

    const currentPath = target.pathname.replace(/\/+$/, '');
    const apiPath = currentPath.endsWith('/api') ? currentPath : `${currentPath}/api`;
    target.pathname = `${apiPath}/webhooks/asaas/${encodeURIComponent(unit.slug)}`.replace(/\/+/g, '/');
    target.search = '';
    target.hash = '';
    return target.toString().replace(/\/$/, '');
  }

  private async tryWebhookUrl(unitId: string) {
    const unit = await this.unitRepository.findOne({ where: { id: unitId } });
    if (!unit) return null;
    try {
      return this.webhookUrl(unit);
    } catch {
      return null;
    }
  }

  private validateKeyEnvironment(apiKey: string, environment: BillingEnvironment) {
    if (apiKey.startsWith('$aact_hmlg_') && environment !== BillingEnvironment.SANDBOX) {
      throw new BadRequestException('A chave informada é de Sandbox, mas o ambiente selecionado é Produção.');
    }
    if (apiKey.startsWith('$aact_prod_') && environment !== BillingEnvironment.PRODUCTION) {
      throw new BadRequestException('A chave informada é de Produção, mas o ambiente selecionado é Sandbox.');
    }
  }

  private expectedPrefix(environment: BillingEnvironment) {
    return environment === BillingEnvironment.PRODUCTION ? '$aact_prod_' : '$aact_hmlg_';
  }

  private maskedApiKey(connection: BillingConnection | null) {
    if (!connection?.apiKeyEncrypted) return null;
    try {
      const apiKey = this.encryption.decrypt(connection.apiKeyEncrypted);
      return `••••••••${apiKey.slice(-4)}`;
    } catch {
      return '••••••••';
    }
  }

  private decryptOptional(encrypted: string | null) {
    if (!encrypted) return null;
    try {
      return this.encryption.decrypt(encrypted);
    } catch {
      return null;
    }
  }

  private accountNumber(account: any) {
    if (!account) return null;
    if (typeof account.accountNumber === 'string') return account.accountNumber;
    if (typeof account.account === 'string') {
      const agency = account.agency ? `${account.agency} / ` : '';
      return `${agency}${account.account}`;
    }
    if (account.accountNumber && typeof account.accountNumber === 'object') {
      return JSON.stringify(account.accountNumber).slice(0, 120);
    }
    return null;
  }

  private connectionState(connection: BillingConnection | null) {
    if (!connection?.apiKeyEncrypted) return 'NOT_CONFIGURED';
    if (!connection.enabled) return 'DISABLED';
    if (connection.lastError) return 'ERROR';
    if (connection.lastValidatedAt) return 'CONNECTED';
    return 'NOT_VALIDATED';
  }

  private webhookState(connection: BillingConnection | null) {
    if (!connection?.externalWebhookId) return 'NOT_CONFIGURED';
    if (connection.lastWebhookError) return 'ERROR';
    if (connection.lastWebhookSyncAt) return 'CONNECTED';
    return 'NOT_VALIDATED';
  }

  private errorMessage(error: any) {
    const response = error?.getResponse?.();
    const message = typeof response === 'object' && response !== null ? response.message : error?.message;
    return String(Array.isArray(message) ? message.join('; ') : message || 'Erro não informado').slice(0, 2000);
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
      apiKeyConfigured: Boolean(connection.apiKeyEncrypted),
      webhookEmail: connection.webhookEmail,
      webhookUrl: connection.webhookUrl,
      externalWebhookId: connection.externalWebhookId,
      remoteAccountNumber: connection.remoteAccountNumber,
      lastValidatedAt: connection.lastValidatedAt,
      lastError: connection.lastError,
      lastWebhookSyncAt: connection.lastWebhookSyncAt,
      lastWebhookError: connection.lastWebhookError,
    };
  }
}
