import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { Agent } from 'https';
import { Repository } from 'typeorm';
import {
  BillingConnection,
  BillingEnvironment,
  BillingProviderName,
} from '../../database/entities';
import { EncryptionService } from './encryption.service';

interface AsaasCallOptions {
  allowDisabled?: boolean;
  timeoutMs?: number;
}

interface AsaasErrorItem {
  code?: string;
  description?: string;
}

interface AsaasErrorBody {
  errors?: AsaasErrorItem[];
  message?: string;
  error?: string;
}

export class AsaasApiException extends HttpException {
  constructor(
    public readonly providerStatus: number | null,
    public readonly providerCode: string | null,
    public readonly requestId: string | null,
    message: string,
    public readonly operation: string,
    statusCode: number,
  ) {
    super({
      statusCode,
      error: 'AsaasApiError',
      message,
      provider: 'ASAAS',
      providerStatus,
      providerCode,
      requestId,
      operation,
    }, statusCode);
  }
}

@Injectable()
export class AsaasClient {
  private readonly logger = new Logger(AsaasClient.name);
  private readonly httpsAgent = new Agent({
    keepAlive: true,
    ...(process.env.ASAAS_FORCE_IPV4 === 'true' ? { family: 4 } : {}),
  });

  constructor(
    @InjectRepository(BillingConnection)
    private readonly repository: Repository<BillingConnection>,
    private readonly encryption: EncryptionService,
  ) {}

  private async connection(unitId: string, allowDisabled = false): Promise<AxiosInstance> {
    const connection = await this.repository.findOne({
      where: { unitId, provider: BillingProviderName.ASAAS },
    });

    if (!connection?.apiKeyEncrypted) {
      throw new NotFoundException('A chave da API do Asaas não está configurada para esta unidade.');
    }
    if (!connection.enabled && !allowDisabled) {
      throw new BadRequestException('A integração Asaas desta unidade está desabilitada.');
    }

    let apiKey: string;
    try {
      apiKey = this.encryption.decrypt(connection.apiKeyEncrypted);
    } catch {
      throw new BadRequestException(
        'Não foi possível descriptografar a chave do Asaas. Confira a variável ENCRYPTION_KEY usada por esta instalação.',
      );
    }

    const baseURL = connection.environment === BillingEnvironment.PRODUCTION
      ? process.env.ASAAS_PRODUCTION_URL || 'https://api.asaas.com/v3'
      : process.env.ASAAS_SANDBOX_URL || 'https://api-sandbox.asaas.com/v3';

    return axios.create({
      baseURL: baseURL.replace(/\/$/, ''),
      timeout: this.timeout(),
      proxy: false,
      maxRedirects: 0,
      httpsAgent: this.httpsAgent,
      headers: {
        access_token: apiKey,
        'User-Agent': this.userAgent(connection.environment),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
  }

  private timeout() {
    const configured = Number(process.env.ASAAS_REQUEST_TIMEOUT_MS || 12_000);
    if (!Number.isFinite(configured)) return 12_000;
    return Math.max(1_000, Math.min(configured, 60_000));
  }

  private userAgent(environment: BillingEnvironment) {
    const appName = (process.env.APP_NAME || 'subscription-club-platform')
      .replace(/[^a-zA-Z0-9_.-]+/g, '-')
      .slice(0, 60);
    return `${appName}/1.0 (Node.js; ${environment.toLowerCase()})`;
  }

  private async call<T>(
    unitId: string,
    method: AxiosRequestConfig['method'],
    path: string,
    data?: unknown,
    params?: Record<string, unknown>,
    responseType?: AxiosRequestConfig['responseType'],
    options: AsaasCallOptions = {},
  ): Promise<T> {
    if (process.env.ASAAS_MOCK === 'true') return this.mock<T>(method || 'GET', path, data);

    const operation = `${String(method || 'GET').toUpperCase()} ${path}`;
    try {
      const http = await this.connection(unitId, options.allowDisabled === true);
      const response = await http.request<T>({
        method,
        url: path,
        data,
        params,
        responseType,
        ...(options.timeoutMs ? { timeout: options.timeoutMs } : {}),
      });
      return response.data;
    } catch (error: unknown) {
      if (error instanceof HttpException && !(error instanceof AsaasApiException)) throw error;
      throw this.mapError(error, operation, unitId);
    }
  }

  private mapError(error: unknown, operation: string, unitId: string): HttpException {
    if (!axios.isAxiosError(error)) {
      this.logger.error(JSON.stringify({ provider: 'ASAAS', unitId, operation, reason: 'unexpected_error' }));
      return new BadGatewayException('Falha inesperada ao comunicar com o Asaas.');
    }

    const status = error.response?.status ?? null;
    const body = error.response?.data as AsaasErrorBody | string | undefined;
    const firstError = typeof body === 'object' && body !== null && Array.isArray(body.errors)
      ? body.errors[0]
      : undefined;
    const providerCode = firstError?.code || null;
    const requestId = this.requestId(error.response);
    const description = this.description(body, error.code, error.message);

    this.logger.warn(JSON.stringify({
      provider: 'ASAAS',
      unitId,
      operation,
      providerStatus: status,
      providerCode,
      requestId,
      axiosCode: error.code || null,
    }));

    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return new AsaasApiException(
        null,
        error.code || 'TIMEOUT',
        requestId,
        'O Asaas não respondeu dentro do tempo esperado. Tente novamente em alguns instantes.',
        operation,
        HttpStatus.GATEWAY_TIMEOUT,
      );
    }

    if (!error.response) {
      return new AsaasApiException(
        null,
        error.code || 'NETWORK_ERROR',
        requestId,
        'Não foi possível estabelecer conexão com o Asaas. Verifique a rede do servidor e tente novamente.',
        operation,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (status === 429) {
      return new AsaasApiException(
        status,
        providerCode,
        requestId,
        'O limite temporário de requisições do Asaas foi atingido. Aguarde e tente novamente.',
        operation,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (status !== null && status >= 500) {
      return new AsaasApiException(
        status,
        providerCode,
        requestId,
        `O Asaas está temporariamente indisponível: ${description}`,
        operation,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // Erros de autenticação do provedor não devem retornar 401 ao frontend,
    // pois 401 é reservado para a sessão do usuário desta aplicação.
    const publicStatus = [400, 401, 403, 404, 409, 422].includes(status || 0)
      ? HttpStatus.UNPROCESSABLE_ENTITY
      : HttpStatus.BAD_GATEWAY;

    return new AsaasApiException(
      status,
      providerCode,
      requestId,
      this.friendlyMessage(status, providerCode, description),
      operation,
      publicStatus,
    );
  }

  private friendlyMessage(status: number | null, code: string | null, description: string) {
    if (status === 401 || code?.includes('access_token') || code === 'invalid_environment') {
      return `A chave do Asaas é inválida, foi revogada ou pertence a outro ambiente. ${description}`.trim();
    }
    if (status === 403) return `A conta Asaas não autorizou esta operação. ${description}`.trim();
    if (status === 404) return `O recurso informado não existe nesta conta ou ambiente do Asaas. ${description}`.trim();
    return `O Asaas recusou a operação: ${description}`;
  }

  private description(body: AsaasErrorBody | string | undefined, code?: string, fallback?: string) {
    if (typeof body === 'string') return this.isHtml(body) ? 'resposta inválida do serviço externo' : body.slice(0, 500);
    const description = body?.errors?.map((item) => item.description).filter(Boolean).join('; ')
      || body?.message
      || body?.error
      || code
      || fallback
      || 'erro não informado';
    return String(description).slice(0, 700);
  }

  private isHtml(value: string) {
    return /<!doctype html|<html[\s>]/i.test(value);
  }

  private requestId(response?: AxiosResponse) {
    const headers = (response?.headers || {}) as Record<string, unknown>;
    return String(
      headers['asaas-request-id']
      || headers['x-request-id']
      || headers['request-id']
      || headers['cf-ray']
      || '',
    ) || null;
  }

  private mock<T>(method: string, path: string, data: any): T {
    const id = `mock_${Math.random().toString(36).slice(2, 12)}`;
    if (path === '/customers' && method.toUpperCase() === 'GET') return { data: [], totalCount: 0 } as T;
    if (path === '/myAccount/accountNumber') return { agency: '0001', account: '000000-0', accountDigit: '0' } as T;
    if (path === '/customers') return { id, ...data } as T;
    if (path === '/checkouts') return { id, link: `http://localhost:4002/mock-checkout/${id}`, ...data } as T;
    if (path === '/subscriptions') return { id, status: 'ACTIVE', ...data } as T;
    if (/^\/subscriptions\/[^/]+\/payments$/.test(path)) {
      return {
        data: [{
          id: `pay_${id}`,
          status: 'PENDING',
          invoiceUrl: `http://localhost:4002/mock-invoice/pay_${id}`,
          bankSlipUrl: `http://localhost:4002/mock-boleto/pay_${id}`,
        }],
        totalCount: 1,
      } as T;
    }
    if (path === '/payments') {
      return {
        id,
        status: 'PENDING',
        invoiceUrl: `http://localhost:4002/mock-invoice/${id}`,
        bankSlipUrl: data?.billingType === 'BOLETO' ? `http://localhost:4002/mock-boleto/${id}` : null,
        ...data,
      } as T;
    }
    if (path.includes('pixQrCode')) {
      return {
        encodedImage: '',
        payload: `000201-mock-${id}`,
        expirationDate: new Date(Date.now() + 3_600_000).toISOString(),
      } as T;
    }
    if (path === '/webhooks' && method.toUpperCase() === 'GET') return { data: [], totalCount: 0 } as T;
    if (path === '/webhooks' || /^\/webhooks\/[^/]+$/.test(path)) {
      return {
        id: path === '/webhooks' ? id : path.split('/').pop(),
        ...data,
        enabled: data?.enabled ?? true,
        interrupted: data?.interrupted ?? false,
        hasAuthToken: true,
      } as T;
    }
    return { success: true, id, data: [] } as T;
  }

  validate(unitId: string) {
    return this.call<any>(unitId, 'GET', '/myAccount/accountNumber', undefined, undefined, undefined, { allowDisabled: true });
  }
  createCustomer(unitId: string, body: unknown) { return this.call<any>(unitId, 'POST', '/customers', body); }
  updateCustomer(unitId: string, id: string, body: unknown) { return this.call<any>(unitId, 'PUT', `/customers/${id}`, body); }
  getCustomer(unitId: string, id: string) { return this.call<any>(unitId, 'GET', `/customers/${id}`); }
  listCustomers(unitId: string, limit = 100, offset = 0) { return this.call<any>(unitId, 'GET', '/customers', undefined, { limit, offset }); }
  createCheckout(unitId: string, body: unknown) { return this.call<any>(unitId, 'POST', '/checkouts', body); }
  cancelCheckout(unitId: string, id: string) { return this.call<any>(unitId, 'POST', `/checkouts/${id}/cancel`); }
  createSubscription(unitId: string, body: unknown) { return this.call<any>(unitId, 'POST', '/subscriptions', body); }
  getSubscription(unitId: string, id: string) { return this.call<any>(unitId, 'GET', `/subscriptions/${id}`); }
  updateSubscription(unitId: string, id: string, body: unknown) { return this.call<any>(unitId, 'PUT', `/subscriptions/${id}`, body); }
  deleteSubscription(unitId: string, id: string) { return this.call<any>(unitId, 'DELETE', `/subscriptions/${id}`); }
  listSubscriptions(unitId: string, params: Record<string, unknown> = {}) { return this.call<any>(unitId, 'GET', '/subscriptions', undefined, params); }
  subscriptionPayments(unitId: string, id: string, status?: string, limit = 10) {
    return this.call<any>(unitId, 'GET', `/subscriptions/${id}/payments`, undefined, { status, limit });
  }
  paymentBook(unitId: string, id: string, month?: number, year?: number) {
    return this.call<ArrayBuffer>(unitId, 'GET', `/subscriptions/${id}/paymentBook`, undefined, { month, year }, 'arraybuffer');
  }
  createPayment(unitId: string, body: unknown) { return this.call<any>(unitId, 'POST', '/payments', body); }
  updatePayment(unitId: string, id: string, body: unknown) { return this.call<any>(unitId, 'PUT', `/payments/${id}`, body); }
  deletePayment(unitId: string, id: string) { return this.call<any>(unitId, 'DELETE', `/payments/${id}`); }
  customerPayments(unitId: string, customer: string, limit = 10, offset = 0) {
    return this.call<any>(unitId, 'GET', '/payments', undefined, { customer, limit, offset });
  }
  pixQrCode(unitId: string, id: string) { return this.call<any>(unitId, 'GET', `/payments/${id}/pixQrCode`); }
  createWebhook(unitId: string, body: unknown) {
    return this.call<any>(unitId, 'POST', '/webhooks', body, undefined, undefined, { allowDisabled: true });
  }
  updateWebhook(unitId: string, id: string, body: unknown) {
    return this.call<any>(unitId, 'PUT', `/webhooks/${id}`, body, undefined, undefined, { allowDisabled: true });
  }
  getWebhook(unitId: string, id: string) {
    return this.call<any>(unitId, 'GET', `/webhooks/${id}`, undefined, undefined, undefined, { allowDisabled: true });
  }
  listWebhooks(unitId: string, limit = 100, offset = 0) {
    return this.call<any>(unitId, 'GET', '/webhooks', undefined, { limit, offset }, undefined, { allowDisabled: true });
  }
  deleteWebhook(unitId: string, id: string) {
    return this.call<any>(unitId, 'DELETE', `/webhooks/${id}`, undefined, undefined, undefined, { allowDisabled: true });
  }
  removeWebhookBackoff(unitId: string, id: string) {
    return this.call<any>(unitId, 'POST', `/webhooks/${id}/removeBackoff`, {}, undefined, undefined, { allowDisabled: true });
  }
}
