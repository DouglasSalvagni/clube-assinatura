'use client';

import { createContext, useContext, useState, ReactNode, useCallback } from 'react';

interface TenantOption {
  id: string;
  slug: string;
  name: string;
}

interface AdminTenantContextType {
  selectedTenants: string[];
  setSelectedTenants: (ids: string[]) => void;
  tenantHeader: string | null;
  allTenants: TenantOption[];
  setAllTenants: (tenants: TenantOption[]) => void;
}

const AdminTenantContext = createContext<AdminTenantContextType>({
  selectedTenants: [],
  setSelectedTenants: () => {},
  tenantHeader: null,
  allTenants: [],
  setAllTenants: () => {},
});

export function AdminTenantProvider({ children }: { children: ReactNode }) {
  const [selectedTenants, setSelectedTenants] = useState<string[]>([]);
  const [allTenants, setAllTenants] = useState<TenantOption[]>([]);

  const tenantHeader = selectedTenants.length === 0
    ? 'all'
    : selectedTenants.join(',');

  return (
    <AdminTenantContext.Provider
      value={{ selectedTenants, setSelectedTenants, tenantHeader, allTenants, setAllTenants }}
    >
      {children}
    </AdminTenantContext.Provider>
  );
}

export function useAdminTenant() {
  return useContext(AdminTenantContext);
}
