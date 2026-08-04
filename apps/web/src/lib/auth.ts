export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('accessToken');
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export function logout() {
  const refreshToken = localStorage.getItem('refreshToken');
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('tenantId');
  if (refreshToken) {
    void fetch(`${process.env.NEXT_PUBLIC_API_URL || '/api'}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined);
  }
  window.location.href = '/login';
}
