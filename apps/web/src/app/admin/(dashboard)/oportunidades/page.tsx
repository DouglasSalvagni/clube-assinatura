'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { useAdminTenant } from '@/lib/admin-tenant-context';
import TenantFilter from '@/components/tenant-filter';
import { usePageTitle } from '@/lib/page-title-context';
import { formatPhone, formatCpfCnpj } from '@/lib/format';

const cycleLabels: Record<string, string> = {
  WEEKLY: 'Semanal',
  BIWEEKLY: 'Quinzenal',
  MONTHLY: 'Mensal',
  BIMONTHLY: 'Bimestral',
  QUARTERLY: 'Trimestral',
  SEMIANNUALLY: 'Semestral',
  YEARLY: 'Anual',
};

const statusMeta: Record<string, { label: string; colors: string }> = {
  aberta: { label: 'Aberta', colors: 'border-ink-muted/20 bg-ink-muted/10 text-ink-tertiary' },
  checkout_gerado: { label: 'Checkout Gerado', colors: 'border-warning/20 bg-warning/10 text-warning' },
  checkout_pago: { label: 'Pago', colors: 'border-success/20 bg-success/10 text-success' },
  checkout_expirado: { label: 'Expirado', colors: 'border-danger/20 bg-danger/10 text-danger' },
  convertida: { label: 'Convertida', colors: 'border-brand/20 bg-brand/10 text-brand' },
  cancelada: { label: 'Cancelada', colors: 'border-ink-muted/20 bg-ink-muted/10 text-ink-tertiary' },
};

interface Oportunidade {
  id: string;
  nome: string;
  cpfCnpj: string;
  telefone: string;
  valor: number;
  cycle: string;
  status: string;
}

interface PageData {
  data: Oportunidade[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  indicadores: {
    total: number;
    valorPotencial: number;
    checkoutPendente: number;
    convertidas: number;
  };
}

export default function AdminOportunidadesPage() {
  const { tenantHeader } = useAdminTenant();
  const { setPageTitle } = usePageTitle();
  const [pageData, setPageData] = useState<PageData | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    setPageTitle('Oportunidades', 'Visão consolidada de todas as tenants');
  }, [setPageTitle]);

  const load = useCallback(async (p: number, q: string, st: string) => {
    try {
      const params = new URLSearchParams({ page: String(p), limit: '20' });
      if (q) params.set('search', q);
      if (st) params.set('status', st);
      const res = await api(`/oportunidades?${params}`, { tenantId: tenantHeader });
      setPageData(res);
    } catch {
      setPageData(null);
    }
  }, [tenantHeader]);

  useEffect(() => {
    load(page, search, statusFilter);
  }, [page, search, statusFilter, load]);

  const fmtBRL = (v: number) =>
    (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const indicadores = pageData?.indicadores;

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Oportunidades</h1>
          <p className="text-sm text-ink-tertiary">Visão consolidada de todas as tenants</p>
        </div>
        <TenantFilter />
      </div>

      {indicadores && (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-edge bg-surface-elevated p-5 shadow-sm">
            <p className="text-2xl font-semibold text-ink">{indicadores.total}</p>
            <p className="text-sm text-ink-tertiary">Total</p>
          </div>
          <div className="rounded-xl border border-edge bg-surface-elevated p-5 shadow-sm">
            <p className="text-2xl font-semibold text-success">{fmtBRL(indicadores.valorPotencial)}</p>
            <p className="text-sm text-ink-tertiary">Valor Potencial</p>
          </div>
          <div className="rounded-xl border border-edge bg-surface-elevated p-5 shadow-sm">
            <p className="text-2xl font-semibold text-warning">{indicadores.checkoutPendente}</p>
            <p className="text-sm text-ink-tertiary">Checkouts Pendentes</p>
          </div>
          <div className="rounded-xl border border-edge bg-surface-elevated p-5 shadow-sm">
            <p className="text-2xl font-semibold text-brand">{indicadores.convertidas}</p>
            <p className="text-sm text-ink-tertiary">Convertidas</p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-edge bg-surface-elevated shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-edge px-5 py-4">
          <div className="relative flex-1 min-w-[200px]">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input
              type="text"
              placeholder="Buscar por nome, CPF ou email..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full rounded-lg border border-edge bg-surface-input pl-9 pr-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </div>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20">
            <option value="">Status</option>
            <option value="aberta">Aberta</option>
            <option value="checkout_gerado">Checkout Gerado</option>
            <option value="convertida">Convertida</option>
            <option value="cancelada">Cancelada</option>
          </select>
          {pageData && (
            <span className="text-xs text-ink-tertiary whitespace-nowrap">{pageData.total} registro{pageData.total !== 1 ? 's' : ''}</span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-canvas/60">
              <tr className="border-b border-edge text-ink-tertiary">
                <th className="px-5 py-3 font-medium">Nome</th>
                <th className="px-5 py-3 font-medium">CPF</th>
                <th className="px-5 py-3 font-medium">Telefone</th>
                <th className="px-5 py-3 font-medium">Valor</th>
                <th className="px-5 py-3 font-medium">Período</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {!pageData || pageData.data.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-ink-tertiary">
                    Nenhuma oportunidade encontrada.
                  </td>
                </tr>
              ) : (
                pageData.data.map((t) => {
                  const meta = statusMeta[t.status] || statusMeta.aberta;
                  return (
                  <tr key={t.id} className="border-b border-edge/70 last:border-0 transition-colors hover:bg-surface-canvas/40">
                    <td className="px-5 py-3 font-medium text-ink">{t.nome}</td>
                    <td className="px-5 py-3 text-ink-secondary">{formatCpfCnpj(t.cpfCnpj)}</td>
                    <td className="px-5 py-3 text-ink-secondary">{formatPhone(t.telefone)}</td>
                    <td className="px-5 py-3 text-ink-secondary">{fmtBRL(t.valor)}</td>
                    <td className="px-5 py-3 text-ink-secondary">{cycleLabels[t.cycle] || t.cycle || '-'}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${meta.colors}`}>
                        {meta.label}
                      </span>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {pageData && pageData.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-edge px-5 py-3">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-secondary transition hover:bg-surface-canvas disabled:cursor-not-allowed disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="text-xs text-ink-tertiary">Página {page} de {pageData.totalPages}</span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= pageData.totalPages}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-secondary transition hover:bg-surface-canvas disabled:cursor-not-allowed disabled:opacity-40"
            >
              Próximo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
