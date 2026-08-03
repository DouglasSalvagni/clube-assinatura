'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface Tenant {
  id: string;
  slug: string;
  name: string;
}

interface TenantSwitcherProps {
  collapsed?: boolean;
}

export default function TenantSwitcher({ collapsed }: TenantSwitcherProps) {
  const { user } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<Tenant | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    api('/tenants/available')
      .then((res) => {
        const list: Tenant[] = res.data ?? [];
        setTenants(list);
        const stored = localStorage.getItem('tenantId');
        const match = list.find((t) => t.id === stored || t.slug === stored);
        setCurrent(match ?? list[0] ?? null);
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (!user || !current || tenants.length <= 1) return null;

  function switchTenant(tenant: Tenant) {
    localStorage.setItem('tenantId', tenant.id);
    setCurrent(tenant);
    setOpen(false);
    window.location.reload();
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex w-full items-center rounded-lg px-3 py-2 text-sm text-ink-secondary transition-colors hover:bg-surface-canvas hover:text-ink ${
          collapsed ? 'justify-center' : 'gap-3'
        }`}
        title={collapsed ? current.name : undefined}
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-brand" />
        {!collapsed && (
          <>
            <span className="flex-1 text-left">{current.name}</span>
            <svg className={`h-3 w-3 text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </>
        )}
      </button>

      {open && (
        <div className={`absolute ${collapsed ? 'left-full top-0 ml-2' : 'left-0 bottom-full mb-2'} w-48 rounded-lg border border-edge bg-surface-elevated p-1 shadow-lg`}>
          {tenants.map((t) => (
            <button
              key={t.id}
              onClick={() => switchTenant(t)}
              className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                t.id === current.id
                  ? 'bg-brand/10 font-medium text-brand'
                  : 'text-ink-secondary hover:bg-surface-canvas hover:text-ink'
              }`}
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.id === current.id ? 'bg-brand' : 'bg-ink-muted'}`} />
              {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
