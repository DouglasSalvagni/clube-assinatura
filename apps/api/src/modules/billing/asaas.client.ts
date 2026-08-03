import { BadGatewayException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { Repository } from 'typeorm';
import {
  BillingConnection,
  BillingEnvironment,
  BillingProviderName,
} from '../../database/entities';
import { EncryptionService } from './encryption.service';

@Injectable()
export class AsaasClient {
  constructor(
    @InjectRepository(BillingConnection)
    private readonly repository: Repository<BillingConnection>,
    private readonly encryption: EncryptionService,
  ) {}

  private async connection(unitId: string): Promise<AxiosInstance> {
    const connection = await this.repository.findOne({
      where: { unitId, provider: BillingProviderName.ASAAS, enabled: true },
    });

    if (!connection?.apiKeyEncrypted) {
      throw new NotFoundException('A conexão Asaas desta unidade não está configurada ou está desabilitada.');
    }

    const apiKey = this.encryption.decrypt(connection.apiKeyEncrypted);
    const baseURL = connection.environment === BillingEnvironment.PRODUCTION
      ? process.env.ASAAS_PRODUCTION_URL || 'https://api.asaas.com/v3'
      : process.env.ASAAS_SANDBOX_URL || 'https://api-sandbox.asaas.com/v3';

    return axios.create({
      baseURL,
      timeout: 30_000,
      headers: {
        access_token: apiKey,
        'User-Agent': 'subscription-club-platform/1.0',
        'Content-Type': 'application/json',
      },
    });
  }

  private async call<T>(
    unitId: string,
    method: AxiosRequestConfig['method'],
    path: string,
    data?: unknown,
    params?: Record<string, unknown>,
    responseType?: AxiosRequestConfig['responseType'],
  ): Promise<T> {
    if (process.env.ASAAS_MOCK === 'true') return this.mock<T>(method || 'GET', path, data);

    try {
      const http = await this.connection(unitId);
      const response = await http.request<T>({ method, url: path, data, params, responseType });
      return response.data;
    } catch (error: any) {
      const description = error?.response?.data?.errors?.[0]?.description
        || error?.response?.data?.message
        || error.message;
      throw new BadGatewayException(`Asaas: ${description}`);
    }
  }

  private mock<T>(method: string, path: string, data: any): T {
    const id = `mock_${Math.random().toString(36).slice(2, 12)}`;
    if (path === '/customers' && method.toUpperCase() === 'GET') return { data: [], totalCount: 0 } as T;
    if (path === '/customers') return { id, ...data } as T;
    if (path === '/checkouts') return { id, link: `http://localhost:4002/mock-checkout/${id}`, ...data } as T;
    if (path === '/subscriptions') return { id, status: 'ACTIVE', ...data } as T;
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
    if (path === '/webhooks' || /^\/webhooks\/[^/]+$/.test(path)) {
      return { id: path === '/webhooks' ? id : path.split('/').pop(), ...data, hasAuthToken: true } as T;
    }
    return { success: true, id, data: [] } as T;
  }

  validate(unitId: string) { return this.call<any>(unitId, 'GET', '/customers', undefined, { limit: 1 }); }
  createCustomer(unitId: string, body: unknown) { return this.call<any>(unitId, 'POST', '/customers', body); }
  updateCustomer(unitId: string, id: string, body: unknown) { return this.call<any>(unitId, 'PUT', `/customers/${id}`, body); }
  getCustomer(unitId: string, id: string) { return this.call<any>(unitId, 'GET', `/customers/${id}`); }
  listCustomers(unitId: string, limit = 100, offset = 0) { return this.call<any>(unitId, 'GET', '/customers', undefined, { limit, offset }); }
  createCheckout(unitId: string, body: unknown) { return this.call<any>(unitId, 'POST', '/checkouts', body); }
  createSubscription(unitId: string, body: unknown) { return this.call<any>(unitId, 'POST', '/subscriptions', body); }
  getSubscription(unitId: string, id: string) { return this.call<any>(unitId, 'GET', `/subscriptions/${id}`); }
  deleteSubscription(unitId: string, id: string) { return this.call<any>(unitId, 'DELETE', `/subscriptions/${id}`); }
  listSubscriptions(unitId: string, params: Record<string, unknown> = {}) { return this.call<any>(unitId, 'GET', '/subscriptions', undefined, params); }
  subscriptionPayments(unitId: string, id: string, status?: string, limit = 10) {
    return this.call<any>(unitId, 'GET', `/subscriptions/${id}/payments`, undefined, { status, limit });
  }
  paymentBook(unitId: string, id: string, month?: number, year?: number) {
    return this.call<ArrayBuffer>(unitId, 'GET', `/subscriptions/${id}/paymentBook`, undefined, { month, year }, 'arraybuffer');
  }
  createPayment(unitId: string, body: unknown) { return this.call<any>(unitId, 'POST', '/payments', body); }
  customerPayments(unitId: string, customer: string, limit = 10, offset = 0) {
    return this.call<any>(unitId, 'GET', '/payments', undefined, { customer, limit, offset });
  }
  pixQrCode(unitId: string, id: string) { return this.call<any>(unitId, 'GET', `/payments/${id}/pixQrCode`); }
  createWebhook(unitId: string, body: unknown) { return this.call<any>(unitId, 'POST', '/webhooks', body); }
  updateWebhook(unitId: string, id: string, body: unknown) { return this.call<any>(unitId, 'PUT', `/webhooks/${id}`, body); }
  getWebhook(unitId: string, id: string) { return this.call<any>(unitId, 'GET', `/webhooks/${id}`); }
  removeWebhookBackoff(unitId: string, id: string) { return this.call<any>(unitId, 'POST', `/webhooks/${id}/removeBackoff`, {}); }
}
