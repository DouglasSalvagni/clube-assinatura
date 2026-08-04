export const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

interface ApiOptions extends RequestInit {
  tenantId?: string | null;
}

interface ApiErrorBody {
  message?: string | string[];
  error?: string;
  requestId?: string | null;
  providerStatus?: number | null;
}

function gatewayMessage(status: number) {
  if (status === 504) return 'O servidor demorou demais para responder. Verifique a conexão externa e tente novamente.';
  if (status === 502 || status === 503) return 'Um serviço externo está temporariamente indisponível. Tente novamente em instantes.';
  return `A operação falhou com erro HTTP ${status}.`;
}

function isHtml(value: string) {
  return /<!doctype html|<html[\s>]/i.test(value);
}

export async function api(path: string, options: ApiOptions = {}) {
  const { tenantId, ...fetchOptions } = options;
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;

  const storedUnitId = typeof window !== 'undefined' ? localStorage.getItem('tenantId') : null;
  const effectiveTenantId = tenantId !== undefined
    ? tenantId
    : storedUnitId || process.env.NEXT_PUBLIC_UNIT_ID || process.env.NEXT_PUBLIC_TENANT_ID || null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((fetchOptions.headers as Record<string, string>) || {}),
  };

  if (effectiveTenantId !== null && effectiveTenantId !== undefined) {
    headers['x-tenant-id'] = effectiveTenantId;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers,
  });

  if (res.status === 401 && typeof window !== 'undefined') {
    localStorage.removeItem('accessToken');
    window.location.href = '/login';
  }

  if (!res.ok) {
    const raw = await res.text();
    const contentType = res.headers.get('content-type') || '';
    let message = gatewayMessage(res.status);
    let requestId = res.headers.get('x-request-id') || res.headers.get('cf-ray');

    if (contentType.includes('application/json') || (!isHtml(raw) && raw.trim().startsWith('{'))) {
      try {
        const parsed = JSON.parse(raw) as ApiErrorBody;
        if (Array.isArray(parsed.message)) message = parsed.message.join('; ');
        else if (typeof parsed.message === 'string') message = parsed.message;
        else if (typeof parsed.error === 'string') message = parsed.error;
        requestId = parsed.requestId || requestId;
      } catch {
        if (raw && !isHtml(raw)) message = raw.slice(0, 700);
      }
    } else if (raw && !isHtml(raw)) {
      message = raw.slice(0, 700);
    }

    if (requestId) message = `${message} Referência: ${requestId}.`;
    throw new Error(message);
  }

  if (res.status === 204) return null;
  const raw = await res.text();
  return raw ? JSON.parse(raw) : null;
}
