export const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

interface ApiOptions extends RequestInit {
  tenantId?: string | null;
  skipAuthRefresh?: boolean;
}

interface ApiErrorBody {
  message?: string | string[];
  error?: string;
  requestId?: string | null;
  providerStatus?: number | null;
}

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

let refreshPromise: Promise<string | null> | null = null;

function gatewayMessage(status: number) {
  if (status === 504) return 'O servidor demorou demais para responder. Verifique a conexão externa e tente novamente.';
  if (status === 502 || status === 503) return 'Um serviço externo está temporariamente indisponível. Tente novamente em instantes.';
  return `A operação falhou com erro HTTP ${status}.`;
}

function isHtml(value: string) {
  return /<!doctype html|<html[\s>]/i.test(value);
}

function clearSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('tenantId');
}

async function refreshAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return null;

  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const data = await response.json() as RefreshResponse;
        if (!data.accessToken || !data.refreshToken) return null;
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        return data.accessToken;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

async function parseApiError(res: Response): Promise<Error> {
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
  return new Error(message);
}

export async function api(path: string, options: ApiOptions = {}) {
  const { tenantId, skipAuthRefresh = false, ...fetchOptions } = options;
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;

  const storedUnitId = typeof window !== 'undefined' ? localStorage.getItem('tenantId') : null;
  const effectiveTenantId = tenantId !== undefined
    ? tenantId
    : storedUnitId || process.env.NEXT_PUBLIC_UNIT_ID || process.env.NEXT_PUBLIC_TENANT_ID || null;

  const makeRequest = (accessToken: string | null) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...((fetchOptions.headers as Record<string, string>) || {}),
    };

    if (effectiveTenantId !== null && effectiveTenantId !== undefined) {
      headers['x-tenant-id'] = effectiveTenantId;
    }

    return fetch(`${API_BASE}${path}`, {
      ...fetchOptions,
      headers,
    });
  };

  let res = await makeRequest(token);

  if (res.status === 401 && !skipAuthRefresh && path !== '/auth/refresh' && typeof window !== 'undefined') {
    const renewedToken = await refreshAccessToken();
    if (renewedToken) res = await makeRequest(renewedToken);
  }

  if (res.status === 401 && typeof window !== 'undefined') {
    clearSession();
    const loginPath = window.location.pathname.startsWith('/admin') ? '/admin/login' : '/login';
    if (window.location.pathname !== loginPath) window.location.href = loginPath;
  }

  if (!res.ok) throw await parseApiError(res);

  if (res.status === 204) return null;
  const raw = await res.text();
  return raw ? JSON.parse(raw) : null;
}
