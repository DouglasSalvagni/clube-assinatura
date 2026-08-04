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

interface RefreshResult {
  accessToken: string | null;
  terminal: boolean;
  error?: Error;
}

let refreshPromise: Promise<RefreshResult> | null = null;

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
  localStorage.removeItem('unitId');
}

function redirectToLogin() {
  if (typeof window === 'undefined') return;
  const loginPath = window.location.pathname.startsWith('/admin') ? '/admin/login' : '/login';
  if (window.location.pathname !== loginPath) window.location.assign(loginPath);
}

function decodeJwtExpiration(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))) as { exp?: number };
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

function expiresSoon(token: string, thresholdSeconds = 60) {
  const expiresAt = decodeJwtExpiration(token);
  return expiresAt !== null && expiresAt <= Date.now() + thresholdSeconds * 1000;
}

async function performRefresh(refreshToken: string): Promise<RefreshResult> {
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      const terminal = [400, 401, 403].includes(response.status);
      return {
        accessToken: null,
        terminal,
        error: new Error(terminal
          ? 'Sua sessão expirou. Entre novamente.'
          : 'Não foi possível renovar a sessão agora. Tente novamente em instantes.'),
      };
    }

    const data = await response.json() as RefreshResponse;
    if (!data.accessToken || !data.refreshToken) {
      return {
        accessToken: null,
        terminal: false,
        error: new Error('A API retornou uma renovação de sessão incompleta.'),
      };
    }

    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    return { accessToken: data.accessToken, terminal: false };
  } catch {
    return {
      accessToken: null,
      terminal: false,
      error: new Error('Não foi possível comunicar com a API para renovar a sessão.'),
    };
  }
}

async function refreshAccessToken(): Promise<RefreshResult> {
  if (typeof window === 'undefined') return { accessToken: null, terminal: true };
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return { accessToken: null, terminal: true };

  if (!refreshPromise) {
    refreshPromise = performRefresh(refreshToken).finally(() => {
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
  let token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;

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

  // Renova antes do vencimento para que chamadas em segundo plano não recebam
  // 401 no exato instante em que o access token expira.
  if (!skipAuthRefresh && token && expiresSoon(token) && path !== '/auth/refresh' && typeof window !== 'undefined') {
    const proactiveRefresh = await refreshAccessToken();
    if (proactiveRefresh.accessToken) {
      token = proactiveRefresh.accessToken;
    } else if (proactiveRefresh.terminal) {
      clearSession();
      redirectToLogin();
      throw proactiveRefresh.error || new Error('Sua sessão expirou.');
    }
    // Falhas transitórias não apagam a sessão. A chamada ainda é tentada e a
    // renovação poderá ser repetida caso a API realmente responda 401.
  }

  let res = await makeRequest(token);

  if (res.status === 401 && !skipAuthRefresh && path !== '/auth/refresh' && typeof window !== 'undefined') {
    const renewed = await refreshAccessToken();
    if (renewed.accessToken) {
      res = await makeRequest(renewed.accessToken);
    } else if (renewed.terminal) {
      clearSession();
      redirectToLogin();
      throw renewed.error || new Error('Sua sessão expirou.');
    } else {
      // Uma indisponibilidade momentânea do endpoint de refresh não deve
      // destruir uma sessão válida de 30 dias.
      throw renewed.error || new Error('Não foi possível renovar a sessão agora.');
    }
  }

  if (res.status === 401 && typeof window !== 'undefined') {
    clearSession();
    redirectToLogin();
  }

  if (!res.ok) throw await parseApiError(res);

  if (res.status === 204) return null;
  const raw = await res.text();
  return raw ? JSON.parse(raw) : null;
}
