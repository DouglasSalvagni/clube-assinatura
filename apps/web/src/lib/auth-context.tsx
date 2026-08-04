'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from './api';

interface Membership {
  unitId: string;
  role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'SALES' | 'FINANCE' | 'SUPPORT' | 'VIEWER';
  active: boolean;
}

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  globalRole?: string;
  is_platform_admin: boolean;
  memberships?: Membership[];
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const data = await api('/auth/me');
      setUser(data);
    } catch {
      // Falhas transitórias da API não devem apagar o usuário da interface.
      // Quando a sessão realmente expira, api() remove os tokens e redireciona.
      if (!localStorage.getItem('accessToken') && !localStorage.getItem('refreshToken')) {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setLoading(false);
      return;
    }
    refresh();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
