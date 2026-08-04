'use client';

import { useEffect, useState, useRef } from 'react';
import { api } from '@/lib/api';
import { useAdminTenant } from '@/lib/admin-tenant-context';
import { Skeleton } from '@/components/page-skeleton';

export default function TenantFilter() {
  const { selectedTenants, setSelectedTenants, allTenants, setAllTenants } = useAdminTenant();
  const [open, setOpen] = useState(false);
  const [loadingTenants, setLoadingTenants] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api('/tenants/available')
      .then((res) => {
        const list = res.data || [];
        setAllTenants(list);
      })
      .catch(() => {})
      .finally(() => setLoadingTenants(false));
  }, [setAllTenants]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const toggle = (id: string) => {
    setSelectedTenants(
      selectedTenants.includes(id)
        ? selectedTenants.filter((t) => t !== id)
        : [...selectedTenants, id]
    );
  };

  const label = selectedTenants.length === 0
    ? 'Todas as unidades'
    : `${selectedTenants.length} unidade${selectedTenants.length > 1 ? 's' : ''}`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-edge bg-surface px-3 py-2 text-sm text-ink transition-colors hover:bg-surface-canvas"
      >
        <svg className="h-4 w-4 text-ink-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125Z" />
        </svg>
        <span>{label}</span>
        <svg className={`h-4 w-4 text-ink-tertiary transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-edge bg-surface p-2 shadow-sm">
          <div className="mb-1 border-b border-edge pb-1">
            <button
              onClick={() => setSelectedTenants([])}
              className={`w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                selectedTenants.length === 0
                  ? 'bg-brand/10 text-brand font-medium'
                  : 'text-ink-tertiary hover:bg-surface-canvas hover:text-ink'
              }`}
            >
              Todas as unidades
            </button>
          </div>
          {allTenants.map((t) => (
            <button
              key={t.id}
              onClick={() => toggle(t.id)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                selectedTenants.includes(t.id)
                  ? 'bg-brand/10 text-brand font-medium'
                  : 'text-ink-secondary hover:bg-surface-canvas hover:text-ink'
              }`}
            >
              <div
                className={`h-4 w-4 rounded border ${
                  selectedTenants.includes(t.id)
                    ? 'border-brand bg-brand'
                    : 'border-edge'
                } flex items-center justify-center`}
              >
                {selectedTenants.includes(t.id) && (
                  <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                )}
              </div>
              <span className="truncate">{t.name}</span>
            </button>
          ))}
          {loadingTenants && (
            <div role="status" aria-label="Carregando unidades" className="space-y-2 px-2 py-3">
              <Skeleton className="h-8 w-full rounded-lg" />
              <Skeleton className="h-8 w-4/5 rounded-lg" />
            </div>
          )}
          {!loadingTenants && allTenants.length === 0 && (
            <p className="px-2 py-3 text-center text-xs text-ink-tertiary">Nenhuma unidade disponível.</p>
          )}
        </div>
      )}
    </div>
  );
}
