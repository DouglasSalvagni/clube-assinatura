import { HttpStatus } from '@nestjs/common';
import { AsaasApiException, AsaasClient } from './asaas.client';

describe('AsaasClient error mapping', () => {
  const client = new AsaasClient({} as any, {} as any);
  const mapError = (error: any) => (client as any).mapError(error, 'GET /test', 'unit-1');

  it('transforma timeout em 504 sem propagar HTML', () => {
    const exception = mapError({
      isAxiosError: true,
      code: 'ECONNABORTED',
      message: 'timeout of 12000ms exceeded',
    }) as AsaasApiException;

    expect(exception.getStatus()).toBe(HttpStatus.GATEWAY_TIMEOUT);
    expect(exception.getResponse()).toMatchObject({
      error: 'AsaasApiError',
      provider: 'ASAAS',
      providerCode: 'ECONNABORTED',
    });
  });

  it('não converte falha de autenticação do Asaas em 401 da aplicação', () => {
    const exception = mapError({
      isAxiosError: true,
      message: 'Request failed with status code 401',
      response: {
        status: 401,
        data: { errors: [{ code: 'invalid_access_token', description: 'Chave inválida' }] },
        headers: { 'asaas-request-id': 'req-asaas-1' },
      },
    }) as AsaasApiException;

    expect(exception.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(exception.getResponse()).toMatchObject({
      providerStatus: 401,
      providerCode: 'invalid_access_token',
      requestId: 'req-asaas-1',
    });
  });

  it('sanitiza páginas HTML devolvidas pelo gateway', () => {
    const exception = mapError({
      isAxiosError: true,
      message: 'Request failed with status code 504',
      response: {
        status: 504,
        data: '<!DOCTYPE html><html><body>Cloudflare error page</body></html>',
        headers: { 'cf-ray': 'ray-1' },
      },
    }) as AsaasApiException;

    expect(exception.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    const response = exception.getResponse() as any;
    expect(response.message).toContain('resposta inválida do serviço externo');
    expect(response.message).not.toContain('<!DOCTYPE');
  });

  it('preserva rate limit como 429', () => {
    const exception = mapError({
      isAxiosError: true,
      message: 'Too many requests',
      response: { status: 429, data: { errors: [] }, headers: {} },
    }) as AsaasApiException;

    expect(exception.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
  });
});
