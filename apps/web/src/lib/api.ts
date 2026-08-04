export const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

interface ApiOptions extends RequestInit {
  tenantId?: string | null;
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
    let message = raw || `Erro HTTP ${res.status}`;

    try {
      const parsed = JSON.parse(raw) as { message?: string | string[]; error?: string };
      if (Array.isArray(parsed.message)) message = parsed.message.join('; ');
      else if (typeof parsed.message === 'string') message = parsed.message;
      else if (typeof parsed.error === 'string') message = parsed.error;
    } catch {
      // Mantém o corpo textual quando a resposta não é JSON.
    }

    throw new Error(message);
  }
  return res.json();
}
