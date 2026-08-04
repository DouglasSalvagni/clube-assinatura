'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminTenant } from '@/lib/admin-tenant-context';
import TenantFilter from '@/components/tenant-filter';
import { usePageTitle } from '@/lib/page-title-context';
import { CardGridSkeleton } from '@/components/page-skeleton';

interface CatalogoRelatorio {
  tipo: string;
  nome: string;
  descricao: string;
  categoria: string;
}

const categoryColors: Record<string, string> = {
  comercial: 'border-blue-200 bg-blue-50 text-blue-700',
  clientes: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  pipeline: 'border-purple-200 bg-purple-50 text-purple-700',
  financeiro: 'border-amber-200 bg-amber-50 text-amber-700',
};

const categoryLabels: Record<string, string> = {
  comercial: 'Comercial',
  clientes: 'Clientes',
  pipeline: 'Pipeline',
  financeiro: 'Financeiro',
};

export default function AdminRelatoriosPage() {
  const { tenantHeader } = useAdminTenant();
  const [relatorios, setRelatorios] = useState<CatalogoRelatorio[]>([]);
  const [loading, setLoading] = useState(true);
  const { setPageTitle } = usePageTitle();

  useEffect(() => {
    setPageTitle('Relatórios', 'Visão consolidada de todas as tenants');
  }, [setPageTitle]);

  useEffect(() => {
    setLoading(true);
    api('/relatorios', { tenantId: tenantHeader })
      .then((res) => setRelatorios(res.relatorios || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tenantHeader]);

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Relatórios</h1>
          <p className="text-sm text-ink-tertiary">Visão consolidada de todas as tenants</p>
        </div>
        <TenantFilter />
      </div>

      {loading ? (
        <CardGridSkeleton />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {relatorios.map((r) => (
            <div
              key={r.tipo}
              className="rounded-lg border border-edge bg-surface p-5 transition-colors hover:bg-surface-canvas"
            >
              <span
                className={`mb-3 inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${categoryColors[r.categoria] || ''}`}
              >
                {categoryLabels[r.categoria] || r.categoria}
              </span>
              <h3 className="mb-1 text-sm font-semibold text-ink">{r.nome}</h3>
              <p className="text-xs text-ink-tertiary">{r.descricao}</p>
            </div>
          ))}
          {relatorios.length === 0 && (
            <p className="col-span-full py-10 text-center text-sm text-ink-tertiary">Nenhum relatório disponível</p>
          )}
        </div>
      )}
    </div>
  );
}
